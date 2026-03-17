/**
 * FORGË Protocol Engine
 * Creates, versions, and manages client protocols
 */

import { db } from '../../lib/db'
import { BIEVariables, GenerationState, ForgeStage, computeVolumeLevel, computeComplexityCeiling } from '../../lib/bie-engine'
import { generateProtocol, ClientContext } from '../ai-service'

export type CreateProtocolInput = {
  clientId: string
  coachId: string
  protocolType: 'movement' | 'nutrition' | 'recovery' | 'accountability' | 'composite'
  stage: ForgeStage
  generationState: GenerationState
  bieVars: BIEVariables
  useAI: boolean
  equipmentAvailable?: string[]
  coachDirectives?: string
  manualPayload?: Record<string, unknown>
}

export async function createProtocolVersion(input: CreateProtocolInput) {
  const {
    clientId, coachId, protocolType, stage, generationState,
    bieVars, useAI, equipmentAvailable, coachDirectives, manualPayload
  } = input

  // Get current version number
  const currentVersion = await db.queryOne<{ max_version: number }>(
    `SELECT COALESCE(MAX(version), 0) as max_version FROM protocols 
     WHERE client_id = $1 AND protocol_type = $2`,
    [clientId, protocolType]
  )

  const newVersion = (currentVersion?.max_version ?? 0) + 1

  // Get client context for AI generation
  let protocolPayload: Record<string, unknown> = manualPayload ?? {}
  let aiModelVersion: string | null = null
  let generatedProtocol = null

  if (useAI) {
    const client = await db.queryOne<{
      full_name: string
      primary_goal: string
      injuries: string[]
      program_tier: string
    }>(
      `SELECT full_name, primary_goal, injuries, program_tier FROM clients WHERE id = $1`,
      [clientId]
    )

    if (!client) throw new Error('Client not found')

    // Get recent adherence summary
    const adherence = await db.queryOne<{
      avg_bar: number
      session_count: number
      completed_count: number
    }>(
      `SELECT 
         AVG(COALESCE(a.completion_pct, CASE WHEN a.record_type = 'session_completed' THEN 100 ELSE 0 END)) as avg_bar,
         COUNT(CASE WHEN a.record_type LIKE 'session%' THEN 1 END) as session_count,
         COUNT(CASE WHEN a.record_type = 'session_completed' THEN 1 END) as completed_count
       FROM adherence_records a
       WHERE a.client_id = $1 AND a.record_date >= CURRENT_DATE - INTERVAL '4 weeks'`,
      [clientId]
    )

    const clientContext: ClientContext = {
      clientId,
      fullName: client.full_name,
      stage,
      programTier: client.program_tier,
      primaryGoal: client.primary_goal || 'General fitness improvement',
      injuries: client.injuries || [],
      currentBIE: bieVars,
      generationState,
      recentAdherence: {
        weeksTracked: 4,
        avgBAR: adherence?.avg_bar ?? bieVars.bar,
        sessionCompletionRate: adherence?.session_count 
          ? (adherence.completed_count / adherence.session_count) 
          : 0.5,
      },
    }

    generatedProtocol = await generateProtocol({
      client: clientContext,
      protocolType: protocolType as 'movement' | 'nutrition' | 'recovery' | 'composite',
      equipmentAvailable,
      coachDirectives,
    })

    protocolPayload = generatedProtocol as unknown as Record<string, unknown>
    aiModelVersion = 'claude-opus-4-6'
  }

  // Compute derived fields
  const complexityCeiling = computeComplexityCeiling(stage, generationState, bieVars.cdi)
  const volumeTarget = computeVolumeLevel(generationState)

  // Insert new protocol version
  const protocol = await db.queryOne<{ id: string; version: number }>(
    `INSERT INTO protocols (
      client_id, version, is_active, name, protocol_type,
      stage, generation_state, bar_at_generation, bli_at_generation, dbi_at_generation,
      complexity_ceiling, volume_target, protocol_payload,
      generated_by, generated_by_user, ai_model_version,
      effective_date, notes, coach_notes
    ) VALUES (
      $1, $2, true, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15,
      CURRENT_DATE, $16, $17
    ) RETURNING id, version`,
    [
      clientId, newVersion,
      generatedProtocol?.name ?? `${protocolType} Protocol v${newVersion}`,
      protocolType,
      stage, generationState, bieVars.bar, bieVars.bli, bieVars.dbi,
      complexityCeiling, volumeTarget, JSON.stringify(protocolPayload),
      useAI ? 'ai' : 'coach', coachId, aiModelVersion,
      generatedProtocol?.coachNotes ?? null,
      coachDirectives ?? null,
    ]
  )

  if (!protocol) throw new Error('Failed to create protocol')

  return {
    protocolId: protocol.id,
    version: protocol.version,
    generatedProtocol,
  }
}

export async function getActiveProtocols(clientId: string) {
  return db.query(
    `SELECT p.*, 
       u.full_name as generated_by_name
     FROM protocols p
     LEFT JOIN users u ON u.id = p.generated_by_user
     WHERE p.client_id = $1 AND p.is_active = true
     ORDER BY p.protocol_type, p.version DESC`,
    [clientId]
  )
}

export async function getProtocolHistory(clientId: string, protocolType?: string) {
  const typeFilter = protocolType ? 'AND p.protocol_type = $2' : ''
  const params = protocolType ? [clientId, protocolType] : [clientId]
  
  return db.query(
    `SELECT p.*, 
       u.full_name as generated_by_name,
       (SELECT COUNT(*) FROM adherence_records ar 
        WHERE ar.protocol_id = p.id) as adherence_count
     FROM protocols p
     LEFT JOIN users u ON u.id = p.generated_by_user
     WHERE p.client_id = $1 ${typeFilter}
     ORDER BY p.protocol_type, p.version DESC`,
    params
  )
}

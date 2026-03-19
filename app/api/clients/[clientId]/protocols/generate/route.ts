import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FORGE_SYSTEM_PROMPT = `You are the FORGË Behavioral Intelligence Engine AI component. You generate adaptive health and fitness protocols for the FORGË platform.

CORE PHILOSOPHY:
- Behavior drives programming. Behavioral capacity determines protocol complexity, not fitness level alone.
- Non-punitive adaptation: when behavioral capacity drops, simplify—never withhold progress.
- Complexity before load: movement coordination progresses before intensity.

FORGE STAGES: Foundations · Optimization · Resilience · Growth · Empowerment

BIE VARIABLES (0-100 scale):
- BAR: ≥80 progression eligible, 65-79 consolidation, 50-64 maintenance, <50 recovery
- BLI: <30 sustainable, 30-50 moderate, 50-70 elevated, >70 critical
- DBI: <30 low, 30-50 moderate, 50-70 high, >70 critical
- LSI: higher = more stable
- PPS: ≥70 advancement eligible

BSLDS MEAL STRUCTURE: Breakfast · Snack · Lunch · Dinner · Snack
- Carbohydrates front-loaded earlier in day
- Dinner is intentionally carb-reduced or carb-free
- Evening snack is protein-forward

You must ALWAYS respond with ONLY a valid JSON object. No markdown, no backticks, no explanation. Just raw JSON.`

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const client = await db.queryOne<{
      coach_id: string; full_name: string; primary_goal: string
      injuries: string[]; program_tier: string; current_stage: string
      available_equipment: string[]; sessions_per_week: number
    }>(
      `SELECT coach_id, full_name, primary_goal, injuries, program_tier,
              current_stage, available_equipment, sessions_per_week
       FROM clients WHERE id = $1`,
      [params.clientId]
    )
    if (!client || (client.coach_id !== session.id && session.role !== 'admin')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const { protocolType, coachDirectives } = body

    const snapshot = await db.queryOne<{
      bar: number; bli: number; dbi: number; cdi: number; lsi: number; pps: number
      generation_state: string
    }>(
      `SELECT bar_score AS bar, bli_score AS bli, dbi_score AS dbi, cdi, lsi, pps, generation_state
       FROM behavioral_snapshots WHERE client_id = $1
       ORDER BY snapshot_date DESC LIMIT 1`,
      [params.clientId]
    )

    const measurements = await db.queryOne<{
      weight_lbs: number | null; body_fat_pct: number | null
      lean_mass_lbs: number | null; waist_in: number | null
    }>(
      `SELECT weight_lbs, body_fat_pct, lean_mass_lbs, waist_in
       FROM client_measurements WHERE client_id = $1
       ORDER BY measurement_date DESC LIMIT 1`,
      [params.clientId]
    )

    const adherenceRecords = await db.query<{ record_type: string }>(
      `SELECT record_type FROM adherence_records WHERE client_id = $1
       AND record_date >= NOW() - INTERVAL '28 days'`,
      [params.clientId]
    )

    const journals = await db.query<{
      body: string | null; sleep_quality: number | null
      energy_level: number | null; stress_level: number | null; mood: number | null
    }>(
      `SELECT body, sleep_quality, energy_level, stress_level, mood
       FROM journal_entries WHERE client_id = $1
       ORDER BY entry_date DESC LIMIT 4`,
      [params.clientId]
    )

    const checkins = await db.query<{
      workout_consistency: number | null; nutrition_adherence: number | null
      sleep_quality: number | null; stress_rating: number | null
      what_worked: string | null; challenges: string | null
      grateful_for: string | null; did_for_self: string | null
    }>(
      `SELECT workout_consistency, nutrition_adherence, sleep_quality, stress_rating,
              what_worked, challenges, grateful_for, did_for_self
       FROM client_checkins WHERE client_id = $1
       ORDER BY checkin_date DESC LIMIT 2`,
      [params.clientId]
    )

    const aiDocs = await db.query<{
      title: string | null
      document_type: string | null
      file_data: string | null
      file_type: string | null
      file_name: string | null
    }>(
      `SELECT title, document_type, file_type, file_name,
              encode(file_data, 'base64') as file_data
       FROM client_documents
       WHERE client_id = $1 AND include_in_ai = true
       ORDER BY created_at DESC LIMIT 5`,
      [params.clientId]
    )

    // Extract text content from documents for AI context
    const docContexts: string[] = []

    for (const doc of aiDocs) {
      if (!doc.file_data) continue

      const fileType = doc.file_type?.toLowerCase() ?? ''
      const label = `[${doc.document_type?.toUpperCase() ?? 'DOCUMENT'}: ${doc.title ?? doc.file_name}]`

      // For text-based files, decode and include content directly
      if (
        fileType.includes('text') ||
        fileType.includes('plain') ||
        fileType.includes('csv') ||
        (doc.file_name?.endsWith('.txt') ?? false) ||
        (doc.file_name?.endsWith('.md') ?? false) ||
        (doc.file_name?.endsWith('.csv') ?? false)
      ) {
        try {
          const text = Buffer.from(doc.file_data, 'base64')
            .toString('utf-8')
            .slice(0, 2000) // cap at 2000 chars per doc
          docContexts.push(`${label}\n${text}`)
        } catch {
          docContexts.push(`${label}\n[Could not read content]`)
        }
      }
      // For PDFs and other binary files, note they exist with metadata
      else if (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false)) {
        docContexts.push(`${label}\n[PDF document uploaded — use title and document type as context]`)
      }
      // For images (progress photos, lab result screenshots etc)
      else if (
        fileType.includes('image') ||
        fileType.includes('jpeg') ||
        fileType.includes('png') ||
        (doc.file_name?.toLowerCase().match(/\.(jpe?g|png|webp|gif)$/) ?? false)
      ) {
        docContexts.push(`${label}\n[Image document — ${doc.document_type} visual reference]`)
      } else {
        docContexts.push(`${label}\n[Document uploaded: ${doc.file_name}]`)
      }
    }

    const docSummary = docContexts.length > 0 ? docContexts.join('\n\n') : 'None'

    const pdfDocs = aiDocs.filter(doc => {
      const fileType = doc.file_type?.toLowerCase() ?? ''
      return Boolean(doc.file_data) && (fileType.includes('pdf') || (doc.file_name?.toLowerCase().endsWith('.pdf') ?? false))
    })

    const equipmentText =
      Array.isArray(client.available_equipment)
        ? client.available_equipment.join(', ')
        : typeof (client as any).available_equipment === 'string'
          ? (client as any).available_equipment
          : 'Standard gym'

    const bie = {
      bar: snapshot?.bar ?? null,
      bli: snapshot?.bli ?? null,
      dbi: snapshot?.dbi ?? null,
      cdi: snapshot?.cdi ?? null,
      lsi: snapshot?.lsi ?? null,
      pps: snapshot?.pps ?? null,
    }

    const journalSummary = journals.map(j => [
      j.body?.slice(0, 100),
      j.sleep_quality ? `sleep ${j.sleep_quality}/5` : '',
      j.energy_level ? `energy ${j.energy_level}/5` : '',
      j.stress_level ? `stress ${j.stress_level}/5` : '',
    ].filter(Boolean).join(' | ')).filter(Boolean).join(' // ')

    const checkinSummary = checkins.map(c => [
      c.workout_consistency ? `workout ${c.workout_consistency}/10` : '',
      c.nutrition_adherence ? `nutrition ${c.nutrition_adherence}/10` : '',
      c.what_worked ? `win: ${c.what_worked.slice(0, 80)}` : '',
      c.challenges ? `challenge: ${c.challenges.slice(0, 80)}` : '',
      c.grateful_for ? `grateful: ${c.grateful_for.slice(0, 60)}` : '',
      c.did_for_self ? `self-care: ${c.did_for_self.slice(0, 60)}` : '',
    ].filter(Boolean).join(' | ')).filter(Boolean).join(' // ')

    const prompt = `Generate a ${protocolType} protocol for this FORGE client.

CLIENT: ${client.full_name}
Stage: ${client.current_stage.toUpperCase()}
Program Tier: ${client.program_tier}
Primary Goal: ${client.primary_goal ?? 'General fitness and wellness'}
Injuries: ${Array.isArray(client.injuries) ? client.injuries.join(', ') : (client.injuries || '') || 'None'}
Equipment: ${equipmentText}
Generation State: ${snapshot?.generation_state ?? 'B'}

BIE VARIABLES:
BAR: ${bie.bar ?? 'not recorded'} | BLI: ${bie.bli ?? 'not recorded'} | DBI: ${bie.dbi ?? 'not recorded'} | CDI: ${bie.cdi ?? 'not recorded'} | LSI: ${bie.lsi ?? 'not recorded'} | PPS: ${bie.pps ?? 'not recorded'}

MEASUREMENTS: Weight ${measurements?.weight_lbs ?? 'unknown'}lb | BF% ${measurements?.body_fat_pct ?? 'unknown'} | Lean mass ${measurements?.lean_mass_lbs ?? 'unknown'}lb | Waist ${measurements?.waist_in ?? 'unknown'}in

RECENT JOURNALS: ${journalSummary || 'No recent journal entries'}
RECENT CHECK-INS: ${checkinSummary || 'No recent check-ins'}
    ═══ CLIENT DOCUMENTS (AI-enabled) ═══
    ${docSummary}
${coachDirectives ? 'COACH DIRECTIVES: ' + coachDirectives : ''}

Protocol name must include ${client.full_name.split(' ')[0] || 'the client'}'s first name or their specific goal — never a generic name.

Respond with ONLY this JSON structure (no markdown, no backticks):
{
  "name": "Protocol name string",
  "rationale": "Why this protocol matches their behavioral state - 2-3 sentences",
  "sessionStructure": {
    "frequency": 3,
    "sessionsPerWeek": 3,
    "sessionType": "Session type name",
    "complexityCeiling": 2,
    "volumeLevel": "Moderate",
    "activationBlock": [{"exerciseName": "name", "sets": 2, "reps": "10", "tempo": "controlled", "coachingCue": "cue"}],
    "primaryBlock": [{"exerciseName": "name", "sets": 3, "reps": "10-12", "tempo": "3-1-1", "loadGuidance": "guidance", "coachingCue": "cue", "swapOption": "alternative"}],
    "accessoryBlock": [{"exerciseName": "name", "sets": 3, "reps": "12", "tempo": "2-1-1", "coachingCue": "cue"}]
  },
  "nutritionStructure": {
    "dailyCalories": 1650,
    "proteinG": 140,
    "carbG": 150,
    "fatG": 55,
    "mealFrequency": 5,
    "mealTiming": "Front-load carbs in B and L. Protein anchor at every meal. Dinner carb-free.",
    "complexityLevel": "Simple",
    "hydrationTargetOz": 90,
    "hydrationSchedule": [
      {"timing": "Morning (on waking)", "amount": "16-20 oz", "notes": "Before coffee"},
      {"timing": "Mid-morning", "amount": "20 oz", "notes": "Between B and S"},
      {"timing": "Afternoon", "amount": "24 oz", "notes": "Between L and D"},
      {"timing": "Evening", "amount": "16 oz", "notes": "Stop 1hr before bed"}
    ],
    "bsldsTemplate": {
      "trainingDay": {/* meal slots object */},
      "restDay": {/* meal slots object */}
    },
    "keyGuidelines": ["guideline 1", "guideline 2", "guideline 3", "guideline 4"],
    "disruption_protocol": "What to do when schedule is disrupted - 2 sentences"
  },
  "recoveryStructure": {
    "sleepTarget": "7-8 hours",
    "stressReductionProtocol": "Daily practices description",
    "activeRecoveryDays": 2,
    "mobilityMinutes": 10,
    "keyRecoveryPractices": ["practice 1", "practice 2", "practice 3"]
  },
  "coachNotes": "Internal coaching notes for coach eyes only",
  "clientFacingMessage": "Encouraging message for client about this protocol - 3-4 sentences"
}`

    // CALL 1 — Core protocol (no mealPlan)
    const userMessageContent: any[] = [{ type: 'text', text: prompt }]

    // Add PDF documents as Anthropic document blocks (when available)
    for (const doc of pdfDocs.slice(0, 3)) {
      if (!doc.file_data) continue
      userMessageContent.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: doc.file_data,
        },
      })
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: FORGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessageContent }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let raw = content.text.trim()
    // Strip common markdown fences more aggressively
    let cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    // Extract just the JSON object between the first { and last }
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1)
    }

    let generated: any
    try {
      generated = JSON.parse(cleaned)
    } catch {
      console.error('Parse error. Raw:', cleaned.slice(0, 300))
      return NextResponse.json({ error: 'AI response parsing failed', raw: cleaned.slice(0, 500) }, { status: 500 })
    }

    // CALL 2 — Meal plan only
    let mealPlan: any[] = []
    try {
      const mealPlanPrompt = `Generate a daily meal plan for this client.

Client: ${client.full_name}
Goal: ${client.primary_goal ?? 'General fitness'}
Weight: ${measurements?.weight_lbs ?? 'unknown'} lbs
Stage: ${client.current_stage}
Daily Targets: ${generated.nutritionStructure?.dailyCalories} cal | ${generated.nutritionStructure?.proteinG}g protein | ${generated.nutritionStructure?.carbG}g carbs | ${generated.nutritionStructure?.fatG}g fat
Meal Frequency: ${generated.nutritionStructure?.mealFrequency} meals
Meal Timing: ${generated.nutritionStructure?.mealTiming}
Injuries: ${Array.isArray(client.injuries) && client.injuries.length > 0 ? client.injuries.join(', ') : 'None'}
${coachDirectives ? 'Coach notes: ' + coachDirectives : ''}

Return ONLY a JSON array (no markdown, no wrapper object):
[
  {
    "time": "8:00-9:00 a.m.",
    "meal": "Breakfast",
    "foods": "Specific foods with exact portions for this client",
    "notes": ""
  }
]

Include: Breakfast, Morning Snack (if applicable), Lunch, Afternoon Snack (if applicable), Training Carbs (training days), Dinner, Evening Snack (if applicable).
Use REAL foods and EXACT gram/oz portions based on the macro targets above.
The meal plan must match ${client.full_name}'s goal of "${client.primary_goal ?? 'General fitness'}".`

      const mealPlanResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: 'You generate meal plans. Respond with ONLY a raw JSON array. No markdown, no backticks, no explanation.',
        messages: [{ role: 'user', content: mealPlanPrompt }],
      })

      const mpContent = mealPlanResponse.content[0]
      if (mpContent.type === 'text') {
        let mpRaw = mpContent.text.trim()
        mpRaw = mpRaw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()

        const firstBracket = mpRaw.indexOf('[')
        const lastBracket = mpRaw.lastIndexOf(']')
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          mpRaw = mpRaw.slice(firstBracket, lastBracket + 1)
        }

        try {
          const parsed = JSON.parse(mpRaw)
          if (Array.isArray(parsed)) {
            mealPlan = parsed
          }
        } catch {
          console.error('Meal plan parse failed, falling back to empty array')
          mealPlan = []
        }
      }
    } catch (e) {
      console.error('Meal plan generation error:', e)
      mealPlan = []
    }

    if (generated && generated.nutritionStructure) {
      generated.nutritionStructure.mealPlan = mealPlan
    }

    return NextResponse.json({
      success: true,
      generated,
      context: {
        bie,
        generationState: snapshot?.generation_state ?? 'B',
        stage: client.current_stage,
        measurements,
        dataPoints: {
          adherenceRecords: adherenceRecords.length,
          journalEntries: journals.length,
          checkins: checkins.length,
          biomarkers: 'none',
          aiDocs: aiDocs.length,
        }
      }
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Protocol generation error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
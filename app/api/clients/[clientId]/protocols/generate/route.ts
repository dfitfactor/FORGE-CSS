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

    const aiDocs = await db.query<{ title: string; document_type: string }>(
      `SELECT title, document_type FROM client_documents
       WHERE client_id = $1 AND include_in_ai = true ORDER BY created_at DESC LIMIT 5`,
      [params.clientId]
    )

    const bie = {
      bar: Number(snapshot?.bar ?? 65),
      bli: Number(snapshot?.bli ?? 40),
      dbi: Number(snapshot?.dbi ?? 35),
      cdi: Number(snapshot?.cdi ?? 35),
      lsi: Number(snapshot?.lsi ?? 60),
      pps: Number(snapshot?.pps ?? 55),
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
Injuries: ${client.injuries?.join(', ') || 'None'}
Equipment: ${client.available_equipment?.join(', ') || 'Standard gym'}
Generation State: ${snapshot?.generation_state ?? 'B'}

BIE VARIABLES:
BAR: ${bie.bar} | BLI: ${bie.bli} | DBI: ${bie.dbi} | CDI: ${bie.cdi} | LSI: ${bie.lsi} | PPS: ${bie.pps}

MEASUREMENTS: Weight ${measurements?.weight_lbs ?? 'unknown'}lb | BF% ${measurements?.body_fat_pct ?? 'unknown'} | Lean mass ${measurements?.lean_mass_lbs ?? 'unknown'}lb | Waist ${measurements?.waist_in ?? 'unknown'}in

RECENT JOURNALS: ${journalSummary || 'No recent journal entries'}
RECENT CHECK-INS: ${checkinSummary || 'No recent check-ins'}
AI DOCUMENTS: ${aiDocs.map(d => d.document_type + ': ' + d.title).join('; ') || 'None'}
${coachDirectives ? 'COACH DIRECTIVES: ' + coachDirectives : ''}

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
      "trainingDay": {
        "breakfast": {"foods": "food description", "protein": "30g", "carbs": "40g", "fats": "10g", "timing": "7-8 AM", "notes": "Pre-training fuel"},
        "morningSnack": {"foods": "food description", "protein": "20g", "carbs": "15g", "fats": "5g", "timing": "10 AM", "notes": "optional"},
        "lunch": {"foods": "food description", "protein": "35g", "carbs": "45g", "fats": "15g", "timing": "12:30-1 PM", "notes": ""},
        "dinner": {"foods": "food description", "protein": "40g", "carbs": "0-10g", "fats": "20g", "timing": "6-7 PM", "notes": "Carb-free"},
        "eveningSnack": {"foods": "food description", "protein": "20g", "carbs": "5g", "fats": "5g", "timing": "8-9 PM", "notes": "Protein-forward"}
      },
      "restDay": {
        "breakfast": {"foods": "food description", "protein": "30g", "carbs": "30g", "fats": "12g", "timing": "8-9 AM", "notes": ""},
        "morningSnack": {"foods": "food description", "protein": "15g", "carbs": "10g", "fats": "8g", "timing": "11 AM", "notes": "optional"},
        "lunch": {"foods": "food description", "protein": "35g", "carbs": "35g", "fats": "15g", "timing": "1-2 PM", "notes": ""},
        "dinner": {"foods": "food description", "protein": "40g", "carbs": "0g", "fats": "20g", "timing": "6-7 PM", "notes": "Protein + veg only"},
        "eveningSnack": {"foods": "food description", "protein": "20g", "carbs": "0g", "fats": "5g", "timing": "8-9 PM", "notes": "Light protein only"}
      }
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

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: FORGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let raw = content.text.trim()
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) raw = jsonMatch[0]

    let generated
    try {
      generated = JSON.parse(raw)
    } catch {
      console.error('Parse error. Raw:', raw.slice(0, 300))
      return NextResponse.json({ error: 'AI response parsing failed', raw: raw.slice(0, 500) }, { status: 500 })
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
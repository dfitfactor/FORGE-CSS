import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { getIntegrationSetting } from '@/lib/integration-settings'

type CountRow = { value: string | null }
type PipelineRow = { stage: string; total: string | null }
type SourceRow = { source: string; total: string | null }
type LeadAgeRow = { bucket: string; total: string | null }
type RecentActivityRow = {
  title: string
  activity_type: string
  happened_at: string
  client_name: string | null
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)

  try {
    requireRole(session, 'coach', 'admin')
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const isAdmin = session?.role === 'admin'
    const coachFilter = isAdmin ? '' : 'AND (c.coach_id = $1 OR c.coach_id IS NULL)'
    const clientParams = isAdmin ? [] : [session!.id]
    const limitParams = isAdmin ? [6] : [session!.id, 6]

    const [
      totalContacts,
      newProspects,
      activeProspects,
      wonOpportunities,
      pipelineValue,
      activitiesLogged,
      pipelineStages,
      promptSources,
      leadAgeDistribution,
      recentActivity,
      aishaSetting,
    ] = await Promise.all([
      db.queryOne<CountRow>(
        `SELECT COUNT(*)::text AS value
         FROM clients c
         WHERE COALESCE(c.status, 'active') != 'churned'
         ${coachFilter}`,
        clientParams
      ),
      db.queryOne<CountRow>(
        `SELECT COUNT(*)::text AS value
         FROM clients c
         WHERE COALESCE(c.status, 'prospect') = 'prospect'
           AND c.intake_date >= CURRENT_DATE - INTERVAL '30 days'
         ${coachFilter}`,
        clientParams
      ),
      db.queryOne<CountRow>(
        `SELECT COUNT(*)::text AS value
         FROM clients c
         WHERE COALESCE(c.status, 'prospect') = 'prospect'
         ${coachFilter}`,
        clientParams
      ),
      db.queryOne<CountRow>(
        `SELECT COUNT(*)::text AS value
         FROM clients c
         WHERE COALESCE(c.status, 'active') = 'active'
           AND c.intake_date >= CURRENT_DATE - INTERVAL '30 days'
         ${coachFilter}`,
        clientParams
      ),
      db.queryOne<CountRow>(
        `SELECT (
           COALESCE((
             SELECT SUM(COALESCE(b.amount_cents, s.price_cents, p.price_cents, 0))
             FROM bookings b
             LEFT JOIN clients c ON c.id = b.client_id
             LEFT JOIN services s ON s.id = b.service_id
             LEFT JOIN packages p ON p.id = b.package_id
             WHERE COALESCE(b.payment_status, 'unpaid') = 'unpaid'
             ${isAdmin ? '' : 'AND (c.coach_id = $1 OR c.coach_id IS NULL)'}
           ), 0)
           +
           COALESCE((
             SELECT SUM(COALESCE(pe.amount_cents, 0))
             FROM package_enrollments pe
             LEFT JOIN clients c ON c.id = pe.client_id
             WHERE COALESCE(pe.payment_status, 'unpaid') != 'paid'
               AND COALESCE(pe.status, 'active') = 'active'
             ${isAdmin ? '' : 'AND (c.coach_id = $1 OR c.coach_id IS NULL)'}
           ), 0)
         )::text AS value`,
        clientParams
      ),
      db.queryOne<CountRow>(
        `SELECT COUNT(*)::text AS value
         FROM audit_log al
         LEFT JOIN clients c ON c.id = al.client_id
         WHERE al.created_at >= NOW() - INTERVAL '28 days'
         ${isAdmin ? '' : 'AND (c.coach_id = $1 OR c.coach_id IS NULL)'}
        `,
        clientParams
      ).catch(() => ({ value: '0' })),
      db.query<PipelineRow>(
        `SELECT
           COALESCE(c.status, 'active') AS stage,
           COUNT(*)::text AS total
         FROM clients c
         WHERE COALESCE(c.status, 'active') != 'churned'
         ${coachFilter}
         GROUP BY 1
         ORDER BY 1`,
        clientParams
      ),
      db.query<SourceRow>(
        `SELECT 'Website'::text AS source, COUNT(*)::text AS total
         FROM clients c
         WHERE c.intake_date >= CURRENT_DATE - INTERVAL '90 days'
         ${coachFilter}`,
        clientParams
      ),
      db.query<LeadAgeRow>(
        `SELECT
           CASE
             WHEN CURRENT_DATE - c.intake_date <= 7 THEN '0-7 days'
             WHEN CURRENT_DATE - c.intake_date <= 14 THEN '8-14 days'
             WHEN CURRENT_DATE - c.intake_date <= 21 THEN '15-21 days'
             WHEN CURRENT_DATE - c.intake_date <= 30 THEN '22-30 days'
             ELSE '30+ days'
           END AS bucket,
           COUNT(*)::text AS total
         FROM clients c
         WHERE COALESCE(c.status, 'prospect') = 'prospect'
         ${coachFilter}
         GROUP BY 1
         ORDER BY MIN(c.intake_date) DESC`,
        clientParams
      ),
      db.query<RecentActivityRow>(
        `SELECT
           COALESCE(te.title, al.action, 'Activity logged') AS title,
           COALESCE(te.event_type, al.action, 'activity') AS activity_type,
           COALESCE(te.created_at, al.created_at)::text AS happened_at,
           c.full_name AS client_name
         FROM audit_log al
         LEFT JOIN clients c ON c.id = al.client_id
         LEFT JOIN timeline_events te
           ON te.client_id = al.client_id
          AND te.created_at BETWEEN al.created_at - INTERVAL '1 minute' AND al.created_at + INTERVAL '1 minute'
         WHERE 1=1
         ${isAdmin ? '' : 'AND (c.coach_id = $1 OR c.coach_id IS NULL)'}
         ORDER BY COALESCE(te.created_at, al.created_at) DESC
         LIMIT $${isAdmin ? '1' : '2'}`,
        limitParams
      ).catch(() => []),
      getIntegrationSetting('aisha_crm'),
    ])

    const prospects = Number(activeProspects?.value ?? '0')
    const won = Number(wonOpportunities?.value ?? '0')
    const opportunityConversion = prospects > 0 ? Number(((won / prospects) * 100).toFixed(1)) : 0

    return NextResponse.json({
      summary: {
        stats: {
          total_contacts: Number(totalContacts?.value ?? '0'),
          new_prospects: Number(newProspects?.value ?? '0'),
          active_opportunities: prospects,
          won_opportunities: won,
          pipeline_value_cents: Number(pipelineValue?.value ?? '0'),
          activities_logged: Number(activitiesLogged?.value ?? '0'),
        },
        conversion: {
          prospect_to_client_rate: opportunityConversion,
          active_to_won_rate: won > 0 ? 100 : 0,
          funnel_efficiency_rate: opportunityConversion,
        },
        pipeline: pipelineStages.map((row) => ({
          stage: row.stage,
          total: Number(row.total ?? '0'),
        })),
        prompt_sources: promptSources.map((row) => ({
          source: row.source,
          total: Number(row.total ?? '0'),
        })),
        lead_age_distribution: leadAgeDistribution.map((row) => ({
          bucket: row.bucket,
          total: Number(row.total ?? '0'),
        })),
        recent_activities: recentActivity.map((row) => ({
          title: row.title,
          activity_type: row.activity_type,
          happened_at: row.happened_at,
          client_name: row.client_name,
        })),
        integration: {
          configured: Boolean(aishaSetting),
          enabled: aishaSetting?.is_enabled ?? false,
          last_test_status: aishaSetting?.last_test_status ?? null,
          last_test_message: aishaSetting?.last_test_message ?? null,
          last_tested_at: aishaSetting?.last_tested_at ?? null,
        },
      },
    })
  } catch (error) {
    console.error('[crm/summary] GET error:', error)
    return NextResponse.json({ error: 'Failed to load CRM summary' }, { status: 500 })
  }
}

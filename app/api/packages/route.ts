import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { packageSchema } from '@/lib/booking'

let supportsIncludedServicesCache: boolean | null = null

async function supportsIncludedServicesTable() {
  if (supportsIncludedServicesCache !== null) return supportsIncludedServicesCache

  const table = await db.queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'package_included_services'
     ) AS exists`
  )

  supportsIncludedServicesCache = Boolean(table?.exists)
  return supportsIncludedServicesCache
}

function buildPackagesQuery(includeIncludedServices: boolean) {
  if (!includeIncludedServices) {
    return `
      SELECT p.*, '[]'::json AS included_services
      FROM packages p
      ORDER BY p.forge_stage ASC, p.sort_order NULLS LAST, p.name ASC
    `
  }

  return `
    SELECT
      p.*,
      COALESCE(included_services.included_services, '[]'::json) AS included_services
    FROM packages p
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'service_id', pis.service_id,
          'monthly_session_allotment', pis.monthly_session_allotment,
          'service_name', s.name,
          'service_slug', s.slug,
          'duration_minutes', s.duration_minutes
        )
        ORDER BY s.name ASC
      ) AS included_services
      FROM package_included_services pis
      JOIN services s ON s.id = pis.service_id
      WHERE pis.package_id = p.id
    ) included_services ON true
    ORDER BY p.forge_stage ASC, p.sort_order NULLS LAST, p.name ASC
  `
}

export async function GET() {
  try {
    const includeIncludedServices = await supportsIncludedServicesTable()
    const packages = await db.query(buildPackagesQuery(includeIncludedServices))
    return NextResponse.json({ packages })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load packages' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = packageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  try {
    const supportsIncludedServices = await supportsIncludedServicesTable()
    const pkg = await db.transaction(async (client) => {
      const insertResult = await client.query(
        `INSERT INTO packages (
          name, slug, description, session_count, duration_minutes,
          price_cents, billing_type, billing_period_months, forge_stage,
          is_public, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11
        )
        RETURNING *`,
        [
          data.name,
          data.slug,
          data.description ?? null,
          data.session_count,
          data.duration_minutes,
          data.price_cents,
          data.billing_type,
          data.billing_period_months ?? null,
          data.forge_stage,
          data.is_public,
          data.sort_order,
        ]
      )

      const createdPackage = insertResult.rows[0]

      if (supportsIncludedServices && createdPackage?.id && data.included_services.length > 0) {
        for (const includedService of data.included_services) {
          await client.query(
            `INSERT INTO package_included_services (
              package_id,
              service_id,
              monthly_session_allotment
            ) VALUES ($1, $2, $3)`,
            [
              createdPackage.id,
              includedService.service_id,
              includedService.monthly_session_allotment,
            ]
          )
        }
      }

      return createdPackage
    })

    return NextResponse.json({ package: pkg }, { status: 201 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create package' }, { status: 500 })
  }
}


import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function supportsIncludedServicesTable() {
  const table = await db.queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'package_included_services'
     ) AS exists`
  )

  return Boolean(table?.exists)
}

function buildPackagesQuery(includeIncludedServices: boolean) {
  if (!includeIncludedServices) {
    return `
      SELECT p.*, '[]'::json AS included_services
      FROM packages p
      WHERE p.is_public = true AND p.is_active = true
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
    WHERE p.is_public = true AND p.is_active = true
    ORDER BY p.forge_stage ASC, p.sort_order NULLS LAST, p.name ASC
  `
}

export async function GET() {
  try {
    const includeIncludedServices = await supportsIncludedServicesTable()
    const [services, packages] = await Promise.all([
      db.query(
        `SELECT *
         FROM services
         WHERE is_public = true AND is_active = true
         ORDER BY name ASC`
      ),
      db.query(buildPackagesQuery(includeIncludedServices)),
    ])

    return NextResponse.json({ services, packages })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load booking options' }, { status: 500 })
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { packageSchema } from '@/lib/booking'
import { z } from 'zod'

const packagePatchSchema = packageSchema.partial().extend({
  is_active: z.boolean().optional(),
})

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { packageId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = packagePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const includedServices = data.included_services
  const packageFields = Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== 'included_services')
  )

  const updates: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(packageFields)) {
    updates.push(`${key} = $${values.length + 1}`)
    values.push(value ?? null)
  }

  if (updates.length === 0 && includedServices === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const supportsIncludedServices = await supportsIncludedServicesTable()

    const pkg = await db.transaction(async (client) => {
      let updatedPackage = null

      if (updates.length > 0) {
        const updateValues = [...values, params.packageId]
        const updateResult = await client.query(
          `UPDATE packages
           SET ${updates.join(', ')}
           WHERE id = $${updateValues.length}
           RETURNING *`,
          updateValues
        )
        updatedPackage = updateResult.rows[0] ?? null
      } else {
        const packageResult = await client.query(
          `SELECT * FROM packages WHERE id = $1`,
          [params.packageId]
        )
        updatedPackage = packageResult.rows[0] ?? null
      }

      if (supportsIncludedServices && includedServices !== undefined) {
        await client.query(
          `DELETE FROM package_included_services WHERE package_id = $1`,
          [params.packageId]
        )

        for (const includedService of includedServices) {
          await client.query(
            `INSERT INTO package_included_services (
              package_id,
              service_id,
              monthly_session_allotment
            ) VALUES ($1, $2, $3)`,
            [
              params.packageId,
              includedService.service_id,
              includedService.monthly_session_allotment,
            ]
          )
        }
      }

      return updatedPackage
    })

    return NextResponse.json({ package: pkg })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update package' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { packageId: string } }
) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await db.query(
      `UPDATE packages
       SET is_active = false
       WHERE id = $1`,
      [params.packageId]
    )
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete package' }, { status: 500 })
  }
}


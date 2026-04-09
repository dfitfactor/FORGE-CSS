import { db } from '@/lib/db'
import { ensureCoachSettingsColumns, getCoachSettingsColumnSupport } from '@/lib/coach-settings'

export const DEFAULT_LOGO_SRC = '/forge-logo.png'

export async function getBrandLogoUrl(): Promise<string> {
  try {
    await ensureCoachSettingsColumns()
    const columns = await getCoachSettingsColumnSupport()

    if (!columns.avatarUrl) {
      return DEFAULT_LOGO_SRC
    }

    const coach = await db.queryOne<{ avatar_url: string | null }>(
      `SELECT avatar_url
       FROM users
       WHERE is_active = true
         AND role IN ('admin', 'coach')
         AND avatar_url IS NOT NULL
         AND avatar_url <> ''
       ORDER BY CASE WHEN lower(email) = 'coach@dfitfactor.com' THEN 0 ELSE 1 END,
                CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
                created_at ASC
       LIMIT 1`
    )

    return coach?.avatar_url?.trim() || DEFAULT_LOGO_SRC
  } catch (err) {
    console.warn('[branding] falling back to default logo:', err)
    return DEFAULT_LOGO_SRC
  }
}

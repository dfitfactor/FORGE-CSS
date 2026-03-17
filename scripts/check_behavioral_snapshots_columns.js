const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const txt = fs.readFileSync(envPath, 'utf8')
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    const val = line.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

async function main() {
  loadEnvLocal()
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || 'forge_css',
    user: process.env.POSTGRES_USER || 'forge_admin',
    password: process.env.POSTGRES_PASSWORD || '',
  })

  await client.connect()
  const res = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'behavioral_snapshots';"
  )
  const cols = res.rows.map(r => r.column_name).sort()
  for (const c of cols) console.log(c)
  await client.end()
}

main().catch(err => {
  console.error('ERROR:', err?.message ?? String(err))
  process.exit(1)
})

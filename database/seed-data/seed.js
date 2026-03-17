/**
 * FORGË CSS — Database Seed Script
 * Creates initial admin user and sample data for development
 */

const { Pool } = require('pg')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'forge_css',
  user: process.env.POSTGRES_USER || 'forge_admin',
  password: process.env.POSTGRES_PASSWORD || '',
})

async function seed() {
  console.log('🔥 Seeding FORGË CSS database...')
  
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    
    // Create admin user
    const adminPassword = await bcrypt.hash('forge-admin-2025', 12)
    const adminId = uuidv4()
    
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES ($1, 'admin@forgeforyou.com', $2, 'FORGË Admin', 'admin')
      ON CONFLICT (email) DO NOTHING
    `, [adminId, adminPassword])
    
    // Create coach user
    const coachPassword = await bcrypt.hash('coach-2025', 12)
    const coachId = uuidv4()
    
    await client.query(`
      INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES ($1, 'coach@dfitfactor.com', $2, 'DFitFactor Coach', 'coach')
      ON CONFLICT (email) DO NOTHING
    `, [coachId, coachPassword])
    
    // Get actual coach id (may already exist)
    const coachRow = await client.query(
      `SELECT id FROM users WHERE email = 'coach@dfitfactor.com'`
    )
    const actualCoachId = coachRow.rows[0]?.id
    
    if (actualCoachId) {
      // Create sample clients
      const clients = [
        {
          fullName: 'Sarah Mitchell',
          email: 'sarah@example.com',
          stage: 'optimization',
          status: 'active',
          tier: 'forge_elite',
          goal: 'Stage competition physique — glute development and body recomposition',
          weightLbs: 148,
          bodyFatPct: 24,
          bar: 82, bli: 35, dbi: 28, cdi: 30, lsi: 72, pps: 74,
          genState: 'A',
        },
        {
          fullName: 'Marcus Thompson',
          email: 'marcus@example.com',
          stage: 'foundations',
          status: 'active',
          tier: 'forge_core',
          goal: 'Build consistent training habits and lose 25 lbs',
          weightLbs: 215,
          bodyFatPct: 32,
          bar: 61, bli: 55, dbi: 62, cdi: 48, lsi: 45, pps: 38,
          genState: 'D',
        },
        {
          fullName: 'Jennifer Park',
          email: 'jennifer@example.com',
          stage: 'resilience',
          status: 'active',
          tier: 'forge_elite',
          goal: 'Improve energy, address hormonal imbalance, maintain lean physique',
          weightLbs: 132,
          bodyFatPct: 19,
          bar: 76, bli: 42, dbi: 35, cdi: 38, lsi: 68, pps: 62,
          genState: 'B',
        },
      ]
      
      for (const clientData of clients) {
        const clientId = uuidv4()
        
        await client.query(`
          INSERT INTO clients (
            id, coach_id, full_name, email, current_stage, status,
            program_tier, primary_goal, intake_date,
            weight_lbs, body_fat_pct
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE - INTERVAL '6 weeks', $9, $10)
        `, [
          clientId, actualCoachId, clientData.fullName, clientData.email,
          clientData.stage, clientData.status, clientData.tier, clientData.goal,
          clientData.weightLbs, clientData.bodyFatPct,
        ])
        
        // Create behavioral snapshot
        const cLsi = clientData.lsi * 0.6 + (100 - clientData.dbi) * 0.4
        const pps = clientData.pps
        
        await client.query(`
          INSERT INTO behavioral_snapshots (
            client_id, snapshot_date, bar, bli, dbi, cdi, lsi, c_lsi, pps,
            generation_state, generation_state_label, computed_from, created_by
          ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          clientId, clientData.bar, clientData.bli, clientData.dbi,
          clientData.cdi, clientData.lsi, cLsi, pps,
          clientData.genState,
          clientData.genState === 'A' ? 'Stable Progression' :
          clientData.genState === 'B' ? 'Consolidation' :
          clientData.genState === 'D' ? 'Recovery / Disruption' : 'Simplified Load',
          ['computed', 'adherence'],
          actualCoachId,
        ])
        
        // Timeline event
        await client.query(`
          INSERT INTO timeline_events (client_id, event_type, title, event_date, created_by)
          VALUES ($1, 'intake', $2, CURRENT_DATE - INTERVAL '6 weeks', $3)
        `, [
          clientId,
          `${clientData.fullName} joined FORGE — beginning ${clientData.stage} stage`,
          actualCoachId,
        ])
        
        // Stage progression
        await client.query(`
          INSERT INTO stage_progressions (
            client_id, to_stage, direction, triggered_by, authorized_by,
            rationale, effective_date
          ) VALUES ($1, $2, 'initialize', 'coach', $3, 'Client intake', CURRENT_DATE - INTERVAL '6 weeks')
        `, [clientId, clientData.stage, actualCoachId])
        
        console.log(`  ✓ Created client: ${clientData.fullName} (${clientData.stage}, State ${clientData.genState})`)
      }
    }
    
    await client.query('COMMIT')
    console.log('\n✅ Seed complete!')
    console.log('\nDefault credentials:')
    console.log('  Coach: coach@dfitfactor.com / coach-2025')
    console.log('  Admin: admin@forgeforyou.com / forge-admin-2025')
    
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Seed failed:', err)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(console.error)

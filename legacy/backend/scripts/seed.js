/**
 * Database seeding script for development
 * Run with: npm run seed
 */

import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Client } = pg

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
    console.log('Connected to database')

    // Create demo project (owner_id omitted in auth-free MVP)
    const project = await client.query(`
      INSERT INTO projects (name, description, coordinate_system)
      VALUES ($1, $2, $3)
      RETURNING id
    `, ['Demo Highway Survey', 'Sample project for highway surveying', 'Zimbabwe Cadastral'])
    console.log('✓ Created demo project')

    if (project.rows.length > 0) {
      const projectId = project.rows[0].id
      await client.query(`
        INSERT INTO survey_points (project_id, point_number, x, y, z, description, point_type, geometry)
        VALUES 
          ($1, 'CP01', 500000, 6000000, 1200, 'Control Point 1', 'control', ST_SetSRID(ST_MakePoint(30.0, -20.0, 1200), 4326)),
          ($1, 'CP02', 500100, 6000100, 1205, 'Control Point 2', 'control', ST_SetSRID(ST_MakePoint(30.001, -20.0005, 1205), 4326)),
          ($1, 'TP01', 500050, 6000050, 1202, 'Traverse Point 1', 'traverse', ST_SetSRID(ST_MakePoint(30.0005, -20.0002, 1202), 4326))
      `, [projectId])
      console.log('✓ Created sample survey points')
    }

    console.log('\n✅ Seeding completed successfully (auth-free mode)!')
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

seed()

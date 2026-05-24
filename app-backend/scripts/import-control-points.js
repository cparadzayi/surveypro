/**
 * Import Control Points from CSV
 * Usage: node scripts/import-control-points.js <path-to-csv-file>
 */

import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'surveypro_v1', // Updated to surveypro_v1
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

// Parse date in various formats
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  
  try {
    // Handle formats like "9/4/1990 0:00" or "1990-09-04"
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    
    // Return in PostgreSQL date format (YYYY-MM-DD)
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.warn(`Could not parse date: ${dateStr}`);
    return null;
  }
}

// Parse numeric value
function parseNumeric(value) {
  if (!value || value.trim() === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// Parse integer value
function parseInt(value) {
  if (!value || value.trim() === '') return null;
  const num = Number.parseInt(value);
  return isNaN(num) ? null : num;
}

async function importControlPoints(csvFilePath) {
  try {
    console.log('Starting import from:', csvFilePath);
    console.log('Connecting to database...');
    
    let imported = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails = [];
    
    const parser = createReadStream(csvFilePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      })
    );
    
    for await (const record of parser) {
      // Use a new client for each record to avoid transaction abort issues
      const client = await pool.connect();
      
      try {
        const controlPoint = {
          monu_num: record.MonuNum?.trim(),
          monu_name: record.MonuName?.trim() || record.MonuNum?.trim(), // Use MonuNum if MonuName is empty
          type: record.Type?.trim(),
          comp_sheet: record.Comp_sheet?.trim() || null,
          topo: record.TOPO?.trim() || null,
          gauss_lo: parseInt(record.Gauss_Lo),
          y_gauss: parseNumeric(record.Y_Gauss),
          x_gauss: parseNumeric(record.X_Gauss),
          msl_hgt: parseNumeric(record.MSL_Hgt),
          ped_hgt: parseNumeric(record.PedHgt),
          pill_hgt: parseNumeric(record.PillHgt),
          top_signal: parseNumeric(record.TopSignal),
          bot_signal: parseNumeric(record.BotSignal),
          last_insp: parseDate(record.Last_insp),
          deg_sqr: record.DegSqr?.trim() || null,
          remark: record.Remark?.trim() || null,
          area_nm: record.AREA_NM?.trim() || null
        };
        
        // Validate required fields (only monu_num and type are truly required)
        if (!controlPoint.monu_num || !controlPoint.type) {
          console.warn(`Skipping invalid record (missing MonuNum or Type): ${record.MonuNum || 'UNKNOWN'}`);
          errors++;
          continue;
        }
        
        // Insert or update (upsert)
        const result = await client.query(
          `INSERT INTO control_points (
            monu_num, monu_name, type, comp_sheet, topo,
            gauss_lo, y_gauss, x_gauss, msl_hgt, ped_hgt, pill_hgt,
            top_signal, bot_signal, last_insp, deg_sqr, remark, area_nm
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (monu_num) 
          DO UPDATE SET
            monu_name = EXCLUDED.monu_name,
            type = EXCLUDED.type,
            comp_sheet = EXCLUDED.comp_sheet,
            topo = EXCLUDED.topo,
            gauss_lo = EXCLUDED.gauss_lo,
            y_gauss = EXCLUDED.y_gauss,
            x_gauss = EXCLUDED.x_gauss,
            msl_hgt = EXCLUDED.msl_hgt,
            ped_hgt = EXCLUDED.ped_hgt,
            pill_hgt = EXCLUDED.pill_hgt,
            top_signal = EXCLUDED.top_signal,
            bot_signal = EXCLUDED.bot_signal,
            last_insp = EXCLUDED.last_insp,
            deg_sqr = EXCLUDED.deg_sqr,
            remark = EXCLUDED.remark,
            area_nm = EXCLUDED.area_nm,
            updated_at = CURRENT_TIMESTAMP
          RETURNING (xmax = 0) AS inserted`,
          [
            controlPoint.monu_num,
            controlPoint.monu_name,
            controlPoint.type,
            controlPoint.comp_sheet,
            controlPoint.topo,
            controlPoint.gauss_lo,
            controlPoint.y_gauss,
            controlPoint.x_gauss,
            controlPoint.msl_hgt,
            controlPoint.ped_hgt,
            controlPoint.pill_hgt,
            controlPoint.top_signal,
            controlPoint.bot_signal,
            controlPoint.last_insp,
            controlPoint.deg_sqr,
            controlPoint.remark,
            controlPoint.area_nm
          ]
        );
        
        if (result.rows[0].inserted) {
          imported++;
        } else {
          updated++;
        }
        
        // Progress indicator
        if ((imported + updated) % 100 === 0) {
          console.log(`Processed ${imported + updated} records...`);
        }
        
      } catch (error) {
        errors++;
        errorDetails.push({
          monu_num: record.MonuNum,
          error: error.message
        });
        
        // Only log first 10 errors to avoid spam
        if (errors <= 10) {
          console.error(`Error processing record ${record.MonuNum}:`, error.message);
        }
      } finally {
        client.release();
      }
    }
    
    console.log('\n✅ Import completed successfully!');
    console.log(`📊 Statistics:`);
    console.log(`   - Imported (new): ${imported}`);
    console.log(`   - Updated (existing): ${updated}`);
    console.log(`   - Errors: ${errors}`);
    console.log(`   - Total processed: ${imported + updated + errors}`);
    
    if (errors > 0 && errors <= 20) {
      console.log('\n❌ Error details:');
      errorDetails.forEach(err => {
        console.log(`   - ${err.monu_num}: ${err.error}`);
      });
    } else if (errors > 20) {
      console.log(`\n❌ Too many errors (${errors}). Showing first 10:`);
      errorDetails.slice(0, 10).forEach(err => {
        console.log(`   - ${err.monu_num}: ${err.error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Main execution
const csvFilePath = process.argv[2];

if (!csvFilePath) {
  console.error('Usage: node scripts/import-control-points.js <path-to-csv-file>');
  console.error('Example: node scripts/import-control-points.js data/control-points.csv');
  process.exit(1);
}

importControlPoints(csvFilePath)
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });

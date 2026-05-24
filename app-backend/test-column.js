import('./src/config/db.js').then(async ({ default: db }) => {
  try {
    const r = await db.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'surveyor_surveyor_chitsikef' 
         AND table_name = 'survey_projects' 
         AND column_name = 'parent_property'`
    );
    console.log('parent_property column exists:', r.rows.length > 0);
    
    // List all columns in the table
    const cols = await db.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'surveyor_surveyor_chitsikef' 
         AND table_name = 'survey_projects'
       ORDER BY ordinal_position`
    );
    console.log('All columns:', cols.rows.map(c => c.column_name));
    
    db.end();
  } catch (e) {
    console.error('Error:', e.message);
    db.end();
  }
}).catch(e => console.error('Import error:', e.message));

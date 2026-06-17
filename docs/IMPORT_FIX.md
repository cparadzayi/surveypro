# Control Points Import Fix

## Problem Identified

The CSV contains **TSM (Temporary Survey Marks)** which have:
- ✅ `MonuNum` (e.g., "TSM987")
- ❌ `MonuName` (empty string)
- ✅ `Type` = "TSM"

The original validation required both `MonuNum` AND `MonuName`, causing 7,451 records to be skipped.

## Solution Applied

### 1. Updated Database Schema
Created migration `010.do.sql` to make `monu_name` nullable:
```sql
ALTER TABLE control_points 
  ALTER COLUMN monu_name DROP NOT NULL;
```

### 2. Updated Import Script
Modified validation logic:
- If `MonuName` is empty, use `MonuNum` as the name
- Only require `MonuNum` and `Type` (not `MonuName`)

## How to Fix

```bash
cd app-backend

# 1. Run new migration
npm run migrate

# 2. Re-run import
node scripts/import-control-points.js "C:/mataranyika/SurveyPro - Copy (6)/cadastral-standard/zimgausscontrolpoints.csv"
```

## Expected Result

All 7,451 records should now import successfully:
```
✅ Import completed successfully!
📊 Statistics:
   - Imported (new): 7451
   - Updated (existing): 0
   - Errors: 0
   - Total processed: 7451
```

## Record Types in Database

After import, you should have:
- **PRIM** - Primary control points (with names)
- **SEC** - Secondary control points (with names)
- **TERT** - Tertiary control points (with names)
- **QUART** - Quaternary control points (with names)
- **TSM** - Temporary Survey Marks (no names, just numbers)

TSM records will have `monu_name` = `monu_num` (e.g., both "TSM987").

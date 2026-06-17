# Control Points CSV Import Guide

## 📋 Overview

Import the full Zimbabwe control points database from CSV file into PostgreSQL.

## 🔧 Prerequisites

1. ✅ Migration completed (`npm run migrate`)
2. ✅ Database table created (`control_points`)
3. ✅ CSV file with control points data

## 📝 CSV File Format

Your CSV file should have these column headers (exact names):

```csv
MonuNum,MonuName,Type,Comp_sheet,TOPO,Gauss_Lo,Y_Gauss,X_Gauss,MSL_Hgt,PedHgt,PillHgt,TopSignal,BotSignal,Last_insp,DegSqr,Remark,AREA_NM
```

**Example:**
```csv
MonuNum,MonuName,Type,Comp_sheet,TOPO,Gauss_Lo,Y_Gauss,X_Gauss,MSL_Hgt,PedHgt,PillHgt,TopSignal,BotSignal,Last_insp,DegSqr,Remark,AREA_NM
1/P,Gasikani,PRIM,TS0404,1730A1,31,82173.34,1894016.19,1470.1,0.15,1.2,0.895,0.438,9/4/1990 0:00,1730,SEC Signal,Lions Den
1/Q,D.R.Church,QUART,TR9227,1731C3,31,-4832.85,1971620.31,1500.5,,,,,1731,Centre of ball,Harare
```

## 🚀 How to Import

### Step 1: Place your CSV file

Put your CSV file in the backend directory, for example:
```
app-backend/data/control-points.csv
```

### Step 2: Run the import script

```bash
cd app-backend
node scripts/import-control-points.js data/control-points.csv
```

Or with full path:
```bash
node scripts/import-control-points.js "C:/path/to/your/control-points.csv"
```

### Step 3: Monitor progress

You'll see output like:
```
Starting import from: data/control-points.csv
Connecting to database...
Processed 100 records...
Processed 200 records...
Processed 300 records...

✅ Import completed successfully!
📊 Statistics:
   - Imported (new): 1250
   - Updated (existing): 0
   - Errors: 5
   - Total processed: 1255
```

## 🔄 Update Existing Data

The script uses **UPSERT** logic:
- If `MonuNum` doesn't exist → **INSERT** new record
- If `MonuNum` exists → **UPDATE** existing record

This means you can:
- ✅ Run the script multiple times safely
- ✅ Update existing records with new data
- ✅ Add new records without duplicates

## ⚠️ Important Notes

### Required Fields
These fields **must** have values:
- `MonuNum` - Monument number (unique)
- `MonuName` - Monument name
- `Type` - Must be one of: PRIM, SEC, TERT, QUART

### Optional Fields
All other fields can be empty/null.

### Date Format
The script accepts various date formats:
- `9/4/1990 0:00`
- `1990-09-04`
- `04/09/1990`

Empty dates are stored as NULL.

### Numeric Fields
Empty numeric values are stored as NULL:
- Coordinates (Y_Gauss, X_Gauss)
- Heights (MSL_Hgt, PedHgt, PillHgt, TopSignal, BotSignal)
- Gauss_Lo (must be 27, 29, 31, or 33)

## 🐛 Troubleshooting

### Error: "Cannot find module 'csv-parse'"

Install dependencies:
```bash
npm install
```

### Error: "relation 'control_points' does not exist"

Run migration first:
```bash
npm run migrate
```

### Error: "ENOENT: no such file or directory"

Check the CSV file path:
```bash
# Use full path
node scripts/import-control-points.js "C:/full/path/to/file.csv"

# Or relative path from app-backend directory
node scripts/import-control-points.js ../data/control-points.csv
```

### Some records show errors

Check the console output for specific errors. Common issues:
- Missing required fields (MonuNum, MonuName, Type)
- Invalid Type value (must be PRIM, SEC, TERT, or QUART)
- Invalid Gauss_Lo value (must be 27, 29, 31, or 33)

## 📊 Verify Import

After import, check the database:

```bash
# Connect to database
psql -U postgres -d surveypro

# Count total records
SELECT COUNT(*) FROM control_points;

# Check by type
SELECT type, COUNT(*) FROM control_points GROUP BY type;

# Check by zone
SELECT gauss_lo, COUNT(*) FROM control_points GROUP BY gauss_lo ORDER BY gauss_lo;

# Check by area
SELECT area_nm, COUNT(*) FROM control_points GROUP BY area_nm ORDER BY COUNT(*) DESC LIMIT 10;

# View sample records
SELECT monu_num, monu_name, type, area_nm FROM control_points LIMIT 10;
```

## 🎯 Quick Reference

```bash
# Full import workflow
cd app-backend

# 1. Ensure migration is done
npm run migrate

# 2. Import CSV
node scripts/import-control-points.js data/control-points.csv

# 3. Verify in database
psql -U postgres -d surveypro -c "SELECT COUNT(*) FROM control_points;"
```

## 📝 Example Output

```
Starting import from: data/control-points.csv
Connecting to database...
Processed 100 records...
Processed 200 records...
Processed 300 records...
Processed 400 records...
Processed 500 records...
Processed 600 records...
Processed 700 records...
Processed 800 records...
Processed 900 records...
Processed 1000 records...
Processed 1100 records...
Processed 1200 records...

✅ Import completed successfully!
📊 Statistics:
   - Imported (new): 1250
   - Updated (existing): 0
   - Errors: 5
   - Total processed: 1255

✨ Done!
```

## 🔍 Column Mapping

| CSV Column | Database Column | Type | Required |
|------------|----------------|------|----------|
| MonuNum | monu_num | VARCHAR(20) | ✅ Yes |
| MonuName | monu_name | VARCHAR(100) | ✅ Yes |
| Type | type | VARCHAR(10) | ✅ Yes |
| Comp_sheet | comp_sheet | VARCHAR(20) | No |
| TOPO | topo | VARCHAR(20) | No |
| Gauss_Lo | gauss_lo | INTEGER | No |
| Y_Gauss | y_gauss | NUMERIC(15,3) | No |
| X_Gauss | x_gauss | NUMERIC(15,3) | No |
| MSL_Hgt | msl_hgt | NUMERIC(10,3) | No |
| PedHgt | ped_hgt | NUMERIC(10,3) | No |
| PillHgt | pill_hgt | NUMERIC(10,3) | No |
| TopSignal | top_signal | NUMERIC(10,3) | No |
| BotSignal | bot_signal | NUMERIC(10,3) | No |
| Last_insp | last_insp | DATE | No |
| DegSqr | deg_sqr | VARCHAR(10) | No |
| Remark | remark | TEXT | No |
| AREA_NM | area_nm | VARCHAR(100) | No |

---

**Ready to import!** 🚀

Place your CSV file and run:
```bash
node scripts/import-control-points.js <path-to-csv>
```

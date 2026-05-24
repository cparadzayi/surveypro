# Duplicate Point Names Analysis

## CSV File: Maglas with calculated points amended.csv

### Total Points: 311 data rows (312 lines including header)

### Duplicates Found: 2

1. **1560A** - Appears on rows **230 and 231** (exact duplicate)
   - Y: 97657.825, X: 2247874.829
   - Status: P
   - Description: 12mm iron peg in concrete
   - Date: 11/11/2020
   - **Location: Chunk 3 (rows 201-300)**

2. **1583A** - Appears on rows **263 and 264** (near duplicate)
   - Row 263: Y: 97505.465, X: 2247987.713
   - Row 264: Y: 97505.463, X: 2247987.704
   - Status: P
   - Description: 12mm iron peg in concrete
   - Date: 11/11/2020
   - **Location: Chunk 3 (rows 201-300)**

## Chunk Distribution (100 points each)

- Chunk 1: Rows 2-101 (100 points)
- Chunk 2: Rows 102-201 (100 points)
- Chunk 3: Rows 202-301 (100 points)
- Chunk 4: Rows 302-311 (10 points)

## Impact on Database Insert

The duplicates are in **Chunk 3**, not Chunk 6. However, the CSV has only **311 data rows**, not 544.

## Possible Explanations for 500/544 Issue

1. **Different CSV file was imported** - The actual imported file might have 544 rows
2. **Database constraint violation** - The `ON CONFLICT (project_id, name)` clause handles duplicates by updating, so duplicates shouldn't cause chunk failure
3. **Data validation issue** - Some points might have invalid coordinates (NULL, NaN, or out-of-range)
4. **PostgreSQL parameter limit** - Chunk 6 might exceed the parameter limit (but unlikely with only 44 points)

## Recommendation

Check the actual CSV file that was imported for project 7 (KuzivaMaglas2026). The file analyzed here has only 311 points, not 544.

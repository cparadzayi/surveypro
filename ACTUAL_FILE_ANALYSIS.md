# Analysis: Maglas 2283 with calculated points amended.csv

## File Details

**Location:** `c:/mataranyika/SurveyPro-nov-alpha/cadastral-standard/Maglas 2283 with calculated points amended.csv`

**Total Lines:** 546 (including header and empty line)
**Data Rows:** 545 (lines 2-546)
**Header:** `Point,Y,X,Status,Description,Date`

## Point Breakdown by Status

### Calculated Points (Not Physical Beacons): 5 points
- M5, M6, M7, M8, M9
- Status: "Calculated"
- Description: "Not beaconed"
- **These are NOT physical points - likely calculated intersections or reference points**

### Control Points (Found): 5 points
- P2, ZA, ZD, ZE, ZG
- Status: "F" (Found)
- Description: "50mm Iron Pipe in Concrete"

### Placed Beacons: 534 points
- 2283A through 2836D
- Status: "P" (Placed)
- Description: "12mm iron peg in concrete"

## Duplicate Found

**Line 512-513:** 2524B appears twice with identical coordinates
- Y: 96835.936, X: 2247821.869
- **Action:** Will be averaged (distance: 0.000m)

## Expected Import Count

**If importing ALL points (including calculated):**
- Total: 545 - 1 duplicate = 544 unique points

**If importing ONLY physical beacons (P + F status):**
- Control points (F): 5
- Placed beacons (P): 534
- Total: 539 - 1 duplicate = 538 unique points

## Database Comparison

**Reported:** 500 points in database
**Expected:** 544 points (if calculated points were included)
**Missing:** 44 points

## Chunk Analysis (100 points per chunk)

Based on 544 unique points (all statuses):

- **Chunk 1:** Points 1-100 ✅ (in database)
- **Chunk 2:** Points 101-200 ✅ (in database)
- **Chunk 3:** Points 201-300 ✅ (in database)
- **Chunk 4:** Points 401-500 ✅ (in database)
- **Chunk 5:** Points 501-544 ❌ (44 points MISSING)

## Missing Points (Lines 502-546)

The last 44 points in the file are missing from the database:

**From line 502 onwards:**
1. 2520A (line 502)
2. 2520B (line 503)
3. 2521A (line 504)
4. 2521B (line 505)
5. 2522A (line 506)
6. 2522B (line 507)
7. 2523A (line 508)
8. 2523B (line 509) ← **This is what you showed in the screenshot**
9. 2523C (line 510)
10. 2523D (line 511)
11. 2524B (line 512) - duplicate
12. 2524B (line 513) - duplicate
13. 2829A (line 514)
14. 2829B (line 515)
15. 2829C (line 516)
16. 2829D (line 517)
17. 2829E (line 518)
18. 2830A (line 519)
19. 2830C (line 520)
20. 2830D (line 521)
21. 2831A (line 522)
22. 2831B (line 523)
23. 2831C (line 524)
24. 2832A (line 525)
25. 2832B (line 526)
26. 2832C (line 527)
27. 2832D (line 528)
28. 2833A (line 529)
29. 2833B (line 530)
30. 2833C (line 531)
31. 2833D (line 532)
32. 2835A (line 533)
33. 2835B (line 534)
34. 2835C (line 535)
35. 2835D (line 536)
36. 2835E (line 537)
37. 2835G (line 538)
38. 2835H (line 539)
39. 2835J (line 540)
40. 2835K (line 541)
41. 2836A (line 542)
42. 2836B (line 543)
43. 2836C (line 544)
44. 2836D (line 545)

**After deduplication:** 43 unique points missing (2524B duplicate removed)

## Root Cause

**Chunk 5 (rows 501-545) failed to insert** - 45 points attempted, 43 unique after deduplication

## Next Steps

1. **Re-import this exact file:** `Maglas 2283 with calculated points amended.csv`
2. **Watch for Chunk 5 error** - The new error handling will show the exact failure reason
3. **Expected log output:**
   ```
   [CoordinatePoint.batchCreate] Processing chunk 5/6 (45 points)
   [CoordinatePoint.batchCreate] ❌ ERROR in chunk 5/6: [ACTUAL ERROR MESSAGE]
   ```

This will reveal why these 44 points failed to insert!

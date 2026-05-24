# Smoke Test Guide - Coordinate List Generation

## 🎯 Purpose

Verify that the Coordinate List generation works correctly with proper page numbering and cross-references.

## 🧪 Test Methods

### Method 1: Quick Node.js Simulation (Fastest)

```bash
cd app-frontend
node smoke-test.js
```

**What it tests:**
- ✅ Data structure validation
- ✅ Page number calculations
- ✅ Cross-reference logic
- ❌ Actual PDF generation (simulated)

**Duration:** ~1 second

---

### Method 2: Browser Console Test (Recommended)

1. **Start the dev server:**
   ```bash
   cd app-frontend
   npm run dev
   ```

2. **Open browser console** (F12)

3. **Run this test code:**
   ```javascript
   // Test with 100 points
   const testPoints = Array.from({length: 100}, (_, i) => ({
     pointId: `P${String(i+1).padStart(4, '0')}`,
     y: 500000 + (i+1) * 10,
     x: 2000000 + (i+1) * 10,
     status: (i+1) % 3 === 0 ? 'F' : 'P',
     description: (i+1) % 2 === 0 ? 'Iron Peg' : 'Iron Pipe',
     surveyDate: '2025-10-25'
   }))

   const surveyorInfo = {
     name: 'Test Surveyor',
     licenseNumber: 'LS001',
     firm: 'Test Firm',
     address: '123 Test Street',
     surveyDate: 'October 2025',
     projectTitle: 'Smoke Test',
     district: 'Test District'
   }

   // Import and run
   import('./src/utils/cadastral-combined-simple.ts').then(module => {
     const generator = new module.SimplifiedCadastralCombinedGenerator()
     return generator.generateCombinedDocument(testPoints, surveyorInfo)
   }).then(result => {
     console.log('✅ Test Results:')
     console.log('Coordinate List:', result.coordinateListRange)
     console.log('Calculations Part 1:', result.calculationsPart1Range)
     console.log('Total Points:', result.adjustedCoordinates.length)
     console.log('Duplicate Points:', result.summary.duplicatePoints)
     
     // Validation
     const coordEnd = result.coordinateListRange.end
     const calcsStart = result.calculationsPart1Range.start
     
     if (calcsStart === coordEnd + 1) {
       console.log('✅ Page numbering is CORRECT')
       console.log(`   Coordinate List ends at ${coordEnd}`)
       console.log(`   Calculations starts at ${calcsStart}`)
     } else {
       console.error('❌ Page numbering is WRONG')
       console.error(`   Expected Calculations to start at ${coordEnd + 1}`)
       console.error(`   But it starts at ${calcsStart}`)
     }
     
     // Check cross-references
     const samplePoint = result.adjustedCoordinates[0]
     console.log('\n📍 Sample Point:')
     console.log('   ID:', samplePoint.pointId)
     console.log('   Field Book Page:', samplePoint.fieldBookPage)
     console.log('   Calculations Page:', samplePoint.calculationsPage)
     
     if (samplePoint.calculationsPage >= calcsStart && 
         samplePoint.calculationsPage <= result.calculationsPart1Range.end) {
       console.log('✅ Cross-reference is in valid range')
     } else {
       console.error('❌ Cross-reference is OUT OF RANGE')
     }
   }).catch(error => {
     console.error('❌ Test failed:', error)
   })
   ```

**What it tests:**
- ✅ Actual PDF generation
- ✅ Page number calculations
- ✅ Cross-reference accuracy
- ✅ Browser console logs

**Duration:** ~5-10 seconds

---

### Method 3: Full UI Test (Most Comprehensive)

1. **Start the dev server:**
   ```bash
   cd app-frontend
   npm run dev
   ```

2. **Open the app:** http://localhost:5173

3. **Navigate to:** Cadastral Standard module

4. **Import test CSV:**
   - Use your existing CSV file
   - Or create a test file with 50-100 points

5. **Generate Field Book:**
   - Fill in surveyor information
   - Click "Generate Field Book"

6. **Generate Documents:**
   - Click "Generate Calculations Part 1"
   - **Two PDFs will download automatically**

7. **Verify Results:**

   **Check Console Logs:**
   ```
   [Simplified Combined] Starting generation...
   [Simplified Combined] Calculations Part 1 generated: X pages
   [Simplified Combined] Coordinate List ACTUAL pages: Y (100-118)
   [Simplified Combined] Calculations Part 1 will be renumbered to: 119-133
   [Simplified Combined] Page offset calculation: 119 - 116 = 3
   ```

   **Check Downloaded PDFs:**
   - Open `Coordinate_List_Pages_100-118_*.pdf`
   - Open `Calculations_Part1_Pages_119-133_*.pdf`
   
   **Verify Page Numbers:**
   - Coordinate List should end at page X (e.g., 118)
   - Calculations Part 1 should start at page X+1 (e.g., 119)
   - No overlap between documents

   **Verify Cross-References:**
   - Pick a point from Coordinate List (e.g., "P0001")
   - Note the "Calcs" column value (e.g., "119")
   - Open Calculations Part 1 PDF
   - Find that point on the specified page
   - Verify it appears on the correct page

**What it tests:**
- ✅ Full end-to-end workflow
- ✅ Actual PDF generation
- ✅ Download functionality
- ✅ Page numbering accuracy
- ✅ Cross-reference accuracy
- ✅ User experience

**Duration:** ~2-3 minutes

---

## ✅ Success Criteria

### 1. Page Numbering
- [ ] Coordinate List starts at page **100**
- [ ] Coordinate List ends at page **X** (e.g., 118)
- [ ] Calculations Part 1 starts at page **X+1** (e.g., 119)
- [ ] No page overlap between documents

### 2. Cross-References
- [ ] "Calcs" column in Coordinate List shows page numbers (not "-")
- [ ] All Calcs values are >= Calculations Part 1 start page
- [ ] All Calcs values are <= Calculations Part 1 end page
- [ ] Points appear on the pages referenced in Calcs column

### 3. Document Quality
- [ ] Both PDFs download successfully
- [ ] Coordinate List has cover page + data pages
- [ ] Calculations Part 1 has all sections
- [ ] All points appear in both documents
- [ ] Coordinates match between documents

### 4. Console Logs
- [ ] No error messages in console
- [ ] Offset calculation is correct
- [ ] Page ranges are logged correctly
- [ ] Sample point updates are shown

---

## 🐛 Common Issues & Solutions

### Issue 1: Page Overlap
**Symptom:** Calculations starts at 116, but Coordinate List ends at 118

**Solution:** Already fixed! The generator now:
1. Generates Coordinate List first to get actual end page
2. Calculates correct offset
3. Regenerates with correct cross-references

**Verify fix:**
```javascript
// Check console logs for:
[Simplified Combined] Coordinate List ACTUAL pages: 19 (100-118)
[Simplified Combined] Calculations Part 1 will be renumbered to: 119-133
[Simplified Combined] Page offset calculation: 119 - 116 = 3
```

### Issue 2: Calcs Column Shows "-"
**Symptom:** Coordinate List Calcs column is empty or shows "-"

**Cause:** Adjusted coordinates don't have calculationsPage values

**Solution:** Ensure Calculations Part 1 is generated first and page offset is applied

### Issue 3: Wrong Cross-References
**Symptom:** Calcs column shows page numbers, but points don't appear on those pages

**Cause:** Page offset calculation is wrong

**Solution:** Check console logs for offset calculation:
```
[Simplified Combined] Page offset calculation: 119 - 116 = 3
[Simplified Combined] Updated point P0001: page 116 -> 119
```

---

## 📊 Test Data Recommendations

### Small Dataset (10 points)
- Quick test
- Easy to verify manually
- Good for debugging

### Medium Dataset (100 points)
- Realistic size
- Tests pagination logic
- ~3-4 pages in Coordinate List

### Large Dataset (541 points)
- Stress test
- Tests performance
- ~16-19 pages in Coordinate List

---

## 🎯 Quick Checklist

Before marking as "PASSED":

- [ ] Ran at least one test method
- [ ] No errors in console
- [ ] Page numbering is sequential
- [ ] Calcs column has values (not "-")
- [ ] Cross-references are accurate
- [ ] Both PDFs download successfully
- [ ] Documents can be opened and viewed

---

## 💡 Tips

1. **Use browser dev tools** - Keep console open to see detailed logs
2. **Test with real data** - Use your actual CSV files for realistic testing
3. **Verify manually** - Open both PDFs and spot-check a few points
4. **Check file sizes** - PDFs should be reasonable size (not 0 bytes)
5. **Test different sizes** - Small, medium, and large datasets

---

## 📝 Reporting Issues

If you find issues, report with:

1. **Test method used** (Node.js, Browser, UI)
2. **Dataset size** (number of points)
3. **Console logs** (copy/paste relevant logs)
4. **Expected vs Actual:**
   - Expected: "Calcs starts at 119"
   - Actual: "Calcs starts at 116"
5. **Screenshots** (if applicable)

---

## ✅ Status

**Last Updated:** 2025-10-25  
**Fix Applied:** Page numbering discrepancy resolved  
**Ready for Testing:** Yes

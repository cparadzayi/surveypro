# Cadastral Standard Module - User Manual

## 📋 Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Step 1: Access the Module](#step-1-access-the-module)
4. [Step 2: Prepare Your CSV File](#step-2-prepare-your-csv-file)
5. [Step 3: Import Survey Data](#step-3-import-survey-data)
6. [Step 4: Enter Surveyor Information](#step-4-enter-surveyor-information)
7. [Step 5: Generate Field Book](#step-5-generate-field-book)
8. [Step 6: Generate Combined Documents](#step-6-generate-combined-documents)
9. [Step 7: Verify Generated Documents](#step-7-verify-generated-documents)
10. [Troubleshooting](#troubleshooting)
11. [FAQ](#faq)

---

## Introduction

The **Cadastral Standard Module** automates the generation of professional cadastral survey documents required for submission to the Surveyor General. This module generates three key documents:

1. **Field Book** (Pages E1, E2, E3...)
2. **Coordinate List** (Pages 100-118+)
3. **Calculations Part 1** (Pages 119-137+)

This manual guides you through the complete workflow from importing your survey data to generating all required documents.

---

## Prerequisites

### Required Information

Before starting, ensure you have:

- ✅ Survey data in CSV format
- ✅ Surveyor's full name
- ✅ Surveyor's license number
- ✅ Firm/Company name
- ✅ Firm address
- ✅ Survey date (month and year)
- ✅ Project title/description
- ✅ District name

### System Requirements

- Modern web browser (Chrome, Firefox, Edge, Safari)
- Internet connection (for initial access)
- PDF viewer (Adobe Reader, browser built-in viewer, etc.)

---

## Step 1: Access the Module

### 1.1 Login to SurveyPro

1. Open your web browser
2. Navigate to: `http://localhost:5173` (or your SurveyPro URL)
3. Enter your credentials:
   - **Username:** Your registered username
   - **Password:** Your password
4. Click **"Login"**

### 1.2 Navigate to Cadastral Standard

1. From the main dashboard, locate the **"Modules"** section
2. Click on **"Cadastral Standard"**
3. You will see the workflow interface with three main sections:
   - Survey Data Import
   - Surveyor Information
   - Document Generation

---

## Step 2: Prepare Your CSV File

### 2.1 CSV File Format

Your CSV file must contain the following columns (in any order):

| Column Name | Description | Example | Required |
|------------|-------------|---------|----------|
| `pointId` | Unique point identifier | P0001, TRIG1, WS1 | ✅ Yes |
| `y` | Y coordinate (Westing) | 500123.456 | ✅ Yes |
| `x` | X coordinate (Southing) | 2000456.789 | ✅ Yes |
| `status` | Point status (F or P) | F, P | ✅ Yes |
| `description` | Point description | Iron Peg, Concrete Beacon | ✅ Yes |
| `surveyDate` | Date surveyed | 2025-10-25 | ✅ Yes |

### 2.2 Example CSV File

```csv
pointId,y,x,status,description,surveyDate
P0001,500123.456,2000456.789,F,Iron Peg,2025-10-25
P0002,500234.567,2000567.890,P,Concrete Beacon,2025-10-25
TRIG1,500345.678,2000678.901,F,Trig Beacon,2025-10-25
WS1,500456.789,2000789.012,F,Working Station,2025-10-25
P0003,500567.890,2000890.123,P,Iron Pipe,2025-10-25
```

### 2.3 Important Notes

- **Point Status:**
  - `F` = Found (existing beacon)
  - `P` = Placed (new beacon)

- **Point Naming Conventions:**
  - Trig beacons: TRIG1, TRIG2, etc.
  - Working stations: WS1, WS2, etc.
  - Regular points: P0001, P0002, etc.

- **Coordinate Format:**
  - Use decimal format (not degrees/minutes/seconds)
  - Include at least 3 decimal places
  - No commas in numbers

- **File Size:**
  - Recommended: Up to 1000 points
  - Maximum: No hard limit, but performance may vary

---

## Step 3: Import Survey Data

### 3.1 Upload CSV File

1. In the **"Survey Data Import"** section, locate the file upload area
2. Click **"Choose File"** or drag and drop your CSV file
3. Select your prepared CSV file from your computer
4. Click **"Open"**

### 3.2 Verify Import

After uploading, you should see:

- ✅ **Success message:** "CSV file imported successfully"
- ✅ **Point count:** "Total Points: 541" (or your actual count)
- ✅ **Data preview:** First few points displayed in a table

**Example Display:**

```
✅ CSV Imported Successfully!

Total Points: 541
Duplicate Points: 23

Preview (first 5 points):
┌─────────┬────────────┬──────────────┬────────┬──────────────────┐
│ Point   │ Y          │ X            │ Status │ Description      │
├─────────┼────────────┼──────────────┼────────┼──────────────────┤
│ P0001   │ 500123.456 │ 2000456.789  │ F      │ Iron Peg         │
│ P0002   │ 500234.567 │ 2000567.890  │ P      │ Concrete Beacon  │
│ TRIG1   │ 500345.678 │ 2000678.901  │ F      │ Trig Beacon      │
│ WS1     │ 500456.789 │ 2000789.012  │ F      │ Working Station  │
│ P0003   │ 500567.890 │ 2000890.123  │ P      │ Iron Pipe        │
└─────────┴────────────┴──────────────┴────────┴──────────────────┘
```

### 3.3 Troubleshooting Import Issues

**Problem:** "Invalid CSV format"
- **Solution:** Check that your CSV has all required columns
- Verify column names match exactly (case-sensitive)
- Ensure no empty rows at the end of the file

**Problem:** "Missing required columns"
- **Solution:** Add any missing columns to your CSV
- Required: pointId, y, x, status, description, surveyDate

**Problem:** "Invalid coordinate values"
- **Solution:** Check that Y and X values are valid numbers
- Remove any commas or special characters
- Ensure decimal point is used (not comma)

---

## Step 4: Enter Surveyor Information

### 4.1 Fill in Surveyor Details

In the **"Surveyor Information"** section, complete all required fields:

#### Personal Information

1. **Surveyor Name:**
   - Enter full name as it appears on license
   - Example: `John Smith`

2. **License Number:**
   - Enter your professional surveyor license number
   - Example: `LS001` or `2023/123`

#### Firm Information

3. **Firm Name:**
   - Enter your company or firm name
   - Example: `Smith Surveying Services`

4. **Firm Address:**
   - Enter complete business address
   - Example: `123 Main Street, Harare, Zimbabwe`

#### Survey Details

5. **Survey Date:**
   - Enter month and year of survey
   - Example: `October 2025`

6. **Project Title:**
   - Enter descriptive project name
   - Example: `Subdivision of Stand 12345, Borrowdale`

7. **District:**
   - Enter district name
   - Example: `Harare` or `Bulawayo`

### 4.2 Example Completed Form

```
┌─────────────────────────────────────────────────────────┐
│ SURVEYOR INFORMATION                                    │
├─────────────────────────────────────────────────────────┤
│ Surveyor Name:     John Smith                           │
│ License Number:    LS001                                │
│ Firm Name:         Smith Surveying Services             │
│ Firm Address:      123 Main Street, Harare, Zimbabwe    │
│ Survey Date:       October 2025                         │
│ Project Title:     Subdivision of Stand 12345           │
│ District:          Harare                               │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Save Information

- Information is automatically saved as you type
- You can edit any field at any time
- Information will be used in all generated documents

---

## Step 5: Generate Field Book

### 5.1 What is the Field Book?

The **Field Book** is a document that lists all survey points with:
- Point identifiers
- Coordinates (3 decimal places)
- Point status (F/P)
- Descriptions
- Page numbers (E1, E2, E3...)

**Format:** 27 points per page

### 5.2 Generate the Document

1. Ensure CSV is imported and surveyor information is complete
2. Locate the **"Document Generation"** section
3. Click the **"Generate Field Book"** button
4. Wait for generation (typically 2-5 seconds)

### 5.3 Download and Verify

After generation:

1. **PDF downloads automatically** with filename:
   ```
   Field_Book_Pages_E1-E21_2025-10-25.pdf
   ```

2. **Success message appears:**
   ```
   ✅ Field Book Generated Successfully!
   
   📄 Pages: E1-E21
   Total Points: 541
   Points per Page: 27
   
   ✓ PDF has been downloaded
   ```

3. **Open the PDF** and verify:
   - ✅ Cover page with project information
   - ✅ Page numbers show E1, E2, E3...
   - ✅ All points are listed
   - ✅ Coordinates have 3 decimal places
   - ✅ Descriptions are correct

### 5.4 Field Book Structure

**Page E1 (Cover Page):**
```
FIELD BOOK

Survey of: Subdivision of Stand 12345
District: Harare
Date: October 2025

Surveyor: John Smith (LS001)
Firm: Smith Surveying Services
```

**Page E2 (Data Pages):**
```
                    FIELD BOOK                        E2

Point      Y           X          Status  Description
─────────────────────────────────────────────────────────
P0001   500123.456  2000456.789    F     Iron Peg
P0002   500234.567  2000567.890    P     Concrete Beacon
...
(27 points per page)
```

---

## Step 6: Generate Combined Documents

### 6.1 What Gets Generated?

When you click **"Generate Calculations Part 1"**, the system generates **TWO documents**:

1. **Coordinate List** (Pages 100-118+)
   - Lists all points with 2 decimal precision
   - Includes cross-references to Field Book and Calculations
   - Grouped by: TRIG BEACONS, WORKING STATIONS, FOUND BEACONS, PLACED BEACONS

2. **Calculations Part 1** (Pages 119-137+)
   - Combined points table
   - Duplicate point analysis
   - Coordinate comparisons
   - Summary statistics

### 6.2 Generate the Documents

1. Ensure Field Book has been generated first
2. Click the **"Generate Calculations Part 1"** button
3. Wait for generation (typically 5-10 seconds)
4. **Two PDFs will download automatically**

### 6.3 Download Confirmation

After generation, you'll see:

```
✅ Combined Documents Generated Successfully!

📄 Coordinate List: Pages 100-118
📄 Calculations Part 1: Pages 119-137

Total Points: 541
Adjusted Coordinates: 540
Duplicate Points: 23

✓ Both PDFs have been downloaded
✓ Calcs column cross-references are correct
✓ Ready for submission to Surveyor General

Note: Print both PDFs in sequence or combine them manually.
```

### 6.4 Downloaded Files

You will receive two files:

1. **Coordinate_List_Pages_100-118_2025-10-25.pdf**
2. **Calculations_Part1_Pages_119-137_2025-10-25.pdf**

---

## Step 7: Verify Generated Documents

### 7.1 Verify Coordinate List

**Open:** `Coordinate_List_Pages_100-118_2025-10-25.pdf`

**Check:**

1. **Cover Page (Page 100):**
   - ✅ Project title is correct
   - ✅ District name is correct
   - ✅ Surveyor information is correct

2. **Data Pages (Pages 101-118):**
   - ✅ Page numbers are sequential (101, 102, 103...)
   - ✅ Points are grouped correctly:
     - TRIG BEACONS (if any)
     - WORKING STATIONS (if any)
     - FOUND BEACONS
     - PLACED BEACONS
   - ✅ Coordinates have 2 decimal places
   - ✅ **F/B column** shows Field Book pages (E1, E2, E3...)
   - ✅ **Calcs column** shows Calculations pages (119, 119, 120...)

**Example Data Page:**

```
                CO-ORDINATE LIST                      103
                                                S.R. No. 132/2023

SURVEY OF: Subdivision of Stand 12345
DISTRICT: Harare

REFERENCES          Lo 29°                    DESCRIPTION
F/B  Calcs  Point   CO-ORDINATES              
                    Metres                    F = Found    F/P   F.B
                    Y          X              P = Placed

CONSTANT            -80 000.00  +2 148 000.00

FOUND BEACONS
E1   119    P0001   420123.46   2148456.79   Iron Peg      F    E1
E1   119    P0002   420234.57   2148567.89   Concrete      F    E1
...
```

### 7.2 Verify Calculations Part 1

**Open:** `Calculations_Part1_Pages_119-137_2025-10-25.pdf`

**Check:**

1. **Cover Page (Page 119):**
   - ✅ Title: "CALCULATIONS PART 1"
   - ✅ Project information
   - ✅ Duplicate points count

2. **Combined Points Table (Pages 120-122):**
   - ✅ All points listed
   - ✅ Coordinates have 3 decimal places
   - ✅ F/B column references Field Book pages

3. **Duplicate Analysis Section (Pages 123-135):**
   - ✅ Each duplicate point has its own section
   - ✅ Shows all observations
   - ✅ Calculates adjusted coordinates
   - ✅ Shows residuals

4. **Summary Page (Last page):**
   - ✅ Total points count
   - ✅ Duplicate points count
   - ✅ Statistics summary

### 7.3 Verify Cross-References

**Critical Check:** Ensure cross-references are correct

1. **Pick a point from Coordinate List:**
   - Example: Point P0001 on page 101
   - Note the **Calcs column** value (e.g., "119")

2. **Open Calculations Part 1:**
   - Go to page 119
   - Find point P0001 in the Combined Points Table
   - ✅ Verify it appears on that page

3. **Check Field Book reference:**
   - Note the **F/B column** value (e.g., "E1")
   - Open Field Book PDF
   - Go to page E1
   - ✅ Verify point P0001 appears on that page

### 7.4 Verify Page Numbering

**Critical Check:** Ensure no page overlap

- ✅ Coordinate List ends at page X (e.g., 118)
- ✅ Calculations Part 1 starts at page X+1 (e.g., 119)
- ✅ No page number appears in both documents
- ✅ Page numbers are sequential

---

## Troubleshooting

### Issue 1: CSV Import Fails

**Symptoms:**
- Error message: "Invalid CSV format"
- No data preview shown

**Solutions:**

1. **Check CSV format:**
   ```bash
   # Correct format:
   pointId,y,x,status,description,surveyDate
   P0001,500123.456,2000456.789,F,Iron Peg,2025-10-25
   
   # Common mistakes:
   # - Missing header row
   # - Wrong column names (case-sensitive)
   # - Extra spaces in column names
   ```

2. **Verify required columns:**
   - All 6 columns must be present
   - Column names must match exactly

3. **Check for special characters:**
   - Remove any commas in numbers
   - Use period (.) for decimals, not comma (,)
   - Remove any quotes around values

### Issue 2: Field Book Generation Fails

**Symptoms:**
- Error message appears
- No PDF downloads

**Solutions:**

1. **Verify surveyor information is complete:**
   - All 7 fields must be filled
   - No empty fields

2. **Check CSV data:**
   - Ensure coordinates are valid numbers
   - Ensure status is either 'F' or 'P'

3. **Clear browser cache:**
   - Press Ctrl+Shift+Delete
   - Clear cached files
   - Reload the page

### Issue 3: Calculations Generation Takes Too Long

**Symptoms:**
- Button shows "Generating..." for more than 30 seconds
- No PDFs download

**Solutions:**

1. **Check browser console:**
   - Press F12 to open developer tools
   - Look for error messages

2. **Reduce dataset size:**
   - If you have >1000 points, split into smaller batches
   - Test with a smaller dataset first

3. **Refresh and retry:**
   - Refresh the page
   - Re-import CSV
   - Try generation again

### Issue 4: Wrong Page Numbers in PDFs

**Symptoms:**
- Coordinate List and Calculations Part 1 have overlapping page numbers
- Cross-references point to wrong pages

**Solutions:**

1. **Regenerate all documents:**
   - Clear all data
   - Re-import CSV
   - Generate Field Book first
   - Then generate Calculations Part 1

2. **Check console logs:**
   - Press F12
   - Look for page numbering calculations
   - Verify offset calculations are correct

### Issue 5: PDFs Don't Download

**Symptoms:**
- Success message appears but no files download
- Browser blocks downloads

**Solutions:**

1. **Check browser download settings:**
   - Allow downloads from localhost
   - Check Downloads folder

2. **Disable popup blocker:**
   - Allow popups from the site
   - Check browser extensions

3. **Try different browser:**
   - Test with Chrome, Firefox, or Edge

---

## FAQ

### Q1: How many points can I import?

**A:** There's no hard limit, but we recommend:
- **Optimal:** 100-500 points
- **Maximum tested:** 1000 points
- **Performance:** Larger datasets may take longer to process

### Q2: Can I edit data after importing?

**A:** Currently, you need to:
1. Edit your CSV file
2. Re-import the updated file
3. Regenerate all documents

### Q3: What coordinate system should I use?

**A:** The system expects:
- **Lo 29° (Zimbabwe coordinate system)**
- Y coordinates (Westing)
- X coordinates (Southing)
- Decimal format with at least 3 decimal places

### Q4: Can I save my work and continue later?

**A:** Yes! The system saves:
- ✅ Imported CSV data
- ✅ Surveyor information
- ✅ Generated documents (in workflow state)

Simply close the browser and return later. Your data will be preserved in the current session.

### Q5: How do I combine the PDFs?

**A:** You have two options:

**Option 1: Print in sequence**
- Print Coordinate List first
- Print Calculations Part 1 second
- Bind together

**Option 2: Merge PDFs**
- Use Adobe Acrobat or online PDF merger
- Combine in order: Coordinate List → Calculations Part 1
- Save as single PDF

### Q6: What if I have duplicate points?

**A:** The system automatically:
- ✅ Detects duplicate observations
- ✅ Calculates adjusted coordinates
- ✅ Generates duplicate analysis section
- ✅ Shows residuals and statistics

Duplicate points are handled correctly in all documents.

### Q7: Can I generate documents without Field Book?

**A:** No. The workflow requires:
1. Import CSV
2. Generate Field Book (creates page references)
3. Generate Calculations Part 1 (uses Field Book references)

Field Book must be generated first.

### Q8: What format should point IDs be?

**A:** Point IDs can be any format, but we recommend:
- **Trig beacons:** TRIG1, TRIG2, TRIG3...
- **Working stations:** WS1, WS2, WS3...
- **Regular points:** P0001, P0002, P0003...
- **Found beacons:** FB1, FB2, FB3...

The system will automatically group them correctly.

### Q9: How do I verify cross-references are correct?

**A:** Follow this checklist:

1. Open Coordinate List
2. Pick any point (e.g., P0001)
3. Note the Calcs column value (e.g., 119)
4. Open Calculations Part 1
5. Go to that page (119)
6. Verify the point appears there
7. Repeat for 5-10 random points

If all match, cross-references are correct!

### Q10: What if page numbers don't match?

**A:** This should not happen with the latest version. If it does:

1. Check console logs (F12)
2. Look for error messages
3. Regenerate all documents
4. Contact support if issue persists

The system now has three bug fixes to ensure perfect page alignment.

---

## Quick Reference Card

### Complete Workflow (5 Steps)

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: IMPORT CSV                                          │
│ ✓ Prepare CSV with required columns                        │
│ ✓ Upload file                                               │
│ ✓ Verify point count                                        │
├─────────────────────────────────────────────────────────────┤
│ STEP 2: ENTER SURVEYOR INFO                                 │
│ ✓ Fill all 7 fields                                         │
│ ✓ Verify information is correct                             │
├─────────────────────────────────────────────────────────────┤
│ STEP 3: GENERATE FIELD BOOK                                 │
│ ✓ Click "Generate Field Book"                               │
│ ✓ Download PDF (Field_Book_Pages_E1-E21_*.pdf)             │
│ ✓ Verify page numbers and data                              │
├─────────────────────────────────────────────────────────────┤
│ STEP 4: GENERATE COMBINED DOCUMENTS                         │
│ ✓ Click "Generate Calculations Part 1"                      │
│ ✓ Download 2 PDFs:                                          │
│   - Coordinate_List_Pages_100-118_*.pdf                     │
│   - Calculations_Part1_Pages_119-137_*.pdf                  │
├─────────────────────────────────────────────────────────────┤
│ STEP 5: VERIFY & SUBMIT                                     │
│ ✓ Check page numbering (no overlap)                         │
│ ✓ Verify cross-references                                   │
│ ✓ Print or merge PDFs                                       │
│ ✓ Submit to Surveyor General                                │
└─────────────────────────────────────────────────────────────┘
```

### Typical Processing Times

| Task | Duration |
|------|----------|
| CSV Import | 1-2 seconds |
| Field Book Generation | 2-5 seconds |
| Combined Documents | 7-12 seconds |
| **Total Workflow** | **10-20 seconds** |

### Document Page Ranges

| Document | Pages | Format |
|----------|-------|--------|
| Field Book | E1-E21 | 27 points/page |
| Coordinate List | 100-118 | 35 points/page |
| Calculations Part 1 | 119-137 | Variable |

---

## Support & Contact

For technical support or questions:

- **Email:** support@surveypro.com
- **Phone:** +263 XXX XXXX
- **Documentation:** See project README files

---

## Version History

- **v1.0** (2025-10-25): Initial release with complete workflow
- **v1.1** (2025-10-25): Fixed page numbering bugs (3 critical fixes)

---

**End of User Manual**

*Last Updated: October 25, 2025*

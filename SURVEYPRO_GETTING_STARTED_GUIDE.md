# SurveyPro - Getting Started Guide
## Your First Cadastral Survey Project

**Version:** 1.0  
**Date:** November 2025  
**For:** New SurveyPro Users

---

## 📋 Table of Contents

1. Introduction
2. Before You Begin
3. Step-by-Step Workflow
4. Tips & Best Practices
5. Troubleshooting

---

## Introduction

Welcome to **SurveyPro** - your digital cadastral survey workflow platform! This guide will walk you through processing your first survey project from start to finish.

### What You'll Learn:
- ✅ How to set up your surveyor profile
- ✅ How to create and manage projects
- ✅ How to import survey coordinates
- ✅ How to select control points
- ✅ How to generate professional cadastral documents

### Time Required:
- **First-time setup:** 10 minutes
- **Processing a typical survey:** 30-45 minutes

---

## Before You Begin

### What You Need:

#### 1. Survey Data (CSV Format)
Your reduced field notes with these columns:
- **Point:** Point name (e.g., P1, P2, P3)
- **Y:** Westing coordinate in meters (e.g., 97538.004)
- **X:** Southing coordinate in meters (e.g., 2247107.872)
- **Status:** F (Fixed) or P (Peg)
- **Description:** Point description (e.g., "50mm Iron Pipe in Concrete")
- **Date of survey:** Format: DD/MM/YYYY

**Example CSV:**
```csv
Point,Y,X,Status,Description,Date of survey
P1,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,15/10/2025
P2,97612.450,2247089.123,P,Wooden Peg,15/10/2025
P3,97601.789,2247156.890,P,Wooden Peg,15/10/2025
```

#### 2. Survey Information
- Project name (e.g., "Stand 123 Borrowdale")
- Client name
- District/Location
- Survey date
- **Central Meridian (Lo zone)** - CRITICAL!

#### 3. Know Your Lo Zone
**This is CRITICAL** - the same coordinates can fall in different zones:

| Lo Zone | Longitude Range | Typical Areas |
|---------|----------------|---------------|
| Lo 25 | 24-26°E | Western Zimbabwe |
| Lo 27 | 26-28°E | Bulawayo, Gweru |
| Lo 29 | 28-30°E | Harare, Masvingo |
| Lo 31 | 30-32°E | Mutare, Chipinge |
| Lo 33 | 32-34°E | Eastern border |

---

## STEP 1: Create Your Surveyor Profile

### Why This Matters:
Your surveyor profile appears on all official documents and PDFs.

### Instructions:

1. **Navigate to Settings**
   - Click **"Settings"** in the main menu
   - Select **"Surveyors"**

2. **Click "Create New Surveyor"**

3. **Fill in Your Details:**
   - **Full Name:** John Doe
   - **Registration Number:** LS 123
   - **Email:** john.doe@example.com
   - **Phone:** +263 77 123 4567
   - **Status:** Active

4. **Click "Save"**

**✅ Result:** Your surveyor profile is now created and will appear on all documents.

---

## STEP 2: Create Your First Project

### Instructions:

1. **Navigate to Cadastral Standard**
   - Click **"Modules"** in the main menu
   - Select **"Cadastral Standard"**

2. **You'll See the QuickStart Modal**
   - This appears automatically for new users

3. **Click "Create New Project"**

4. **Fill in Project Details:**

   **Basic Information:**
   - **Project Name:** Stand 123 Borrowdale *(required)*
   - **Client Name:** ABC Properties Ltd
   - **Survey Date:** 15/10/2025

   **Advanced Configuration** (click to expand):
   - **District:** Harare
   - **Designation:** Subdivision of Stand 456
   - **Instruments Used:** Leica TS16, Trimble R12

5. **Click "Create & Continue"**

**✅ Result:** Your project is created and you're ready to import data.

**📝 Note:** Control points and Lo zone will be selected AFTER importing CSV data.

---

## STEP 3: Prepare Your CSV Data

### CSV Format Requirements:

Your CSV file must have these exact column headers:
```
Point,Y,X,Status,Description,Date of survey
```

### Example Data:

**File: stand123_coordinates.csv**
```csv
Point,Y,X,Status,Description,Date of survey
CP1,97538.004,2247107.872,F,Trig Beacon MGWANI,15/10/2025
CP2,97612.450,2247089.123,F,Trig Beacon VOMGWE,15/10/2025
P1,97556.123,2247098.456,P,50mm Iron Pipe in Concrete,15/10/2025
P2,97568.789,2247102.345,P,Wooden Peg,15/10/2025
P3,97575.234,2247115.678,P,Wooden Peg,15/10/2025
P4,97563.567,2247119.890,P,Wooden Peg,15/10/2025
```

### Important Notes:

1. **Coordinates:**
   - Y = Westing (meters)
   - X = Southing (meters)
   - Use Cape Lo coordinate system

2. **Status Codes:**
   - **F** = Fixed point (control points, trig beacons)
   - **P** = Peg (survey points)

3. **Date Format:**
   - Use DD/MM/YYYY format
   - Example: 15/10/2025

4. **Save as CSV:**
   - Use UTF-8 encoding
   - No special characters in point names

### Download Template:

In SurveyPro, click **"Download CSV Template"** to get a pre-formatted file with sample data.

---

## STEP 4: Import Coordinates

### Instructions:

1. **Select Your Project**
   - If returning, select your surveyor from dropdown
   - Select your project from dropdown
   - ✅ You'll see: "Project selected: Stand 123 Borrowdale"

2. **⚠️ SELECT LO ZONE (CRITICAL!)**
   
   You'll see a prominent warning banner:
   
   **"CRITICAL: The same nominal coordinates can fall in different Lo zones."**
   
   **For Harare area, select Lo 29:**
   - Click the **"Lo 29"** button
   - Range shown: 28-30°E
   - ✅ You'll see: "Lo 29 selected - Ready to import"

3. **Click "Import Coordinates"**
   - Browse to your CSV file
   - Select **stand123_coordinates.csv**
   - Click "Open"

4. **Review Import Results**
   - ✅ "6 points imported (Lo 29)"
   - You'll see a preview of your data
   - Check that coordinates look correct

**✅ Result:** Your survey data is now loaded into SurveyPro.

### Example Import Summary:
```
✅ 6 points imported (Lo 29)

Summary:
- Fixed Points: 2
- Peg Points: 4
- Total Points: 6
- Coordinate System: Cape Lo 29
- Date Range: 15/10/2025
```

---

## STEP 5: Select Control Points

### Why This Matters:
Control points (trig beacons) are reference points for your survey. You need minimum 3 for accurate positioning.

### Instructions:

1. **Click "Continue to Control Point Selection"**

2. **You'll See an Interactive Map**
   - Your survey area is shown with a marker
   - All available control points are displayed
   - Distances from your survey are calculated

3. **Auto-Detected Lo Zone**
   - System suggests: **"Lo 29"** (based on your coordinates)
   - Click **"Apply Lo 29"** if correct

4. **View Smart Recommendations**
   
   The system recommends 5 control points:
   ```
   📍 Recommended Control Points:
   
   1. MGWANI (Nearest)
      Distance: 2.3 km NW
      Coordinates: Y=97538.004, X=2247107.872
      
   2. VOMGWE (East Coverage)
      Distance: 3.1 km E
      Coordinates: Y=97612.450, X=2247089.123
      
   3. HARARE (South Coverage)
      Distance: 4.5 km S
      Coordinates: Y=97580.123, X=2247145.678
   ```

5. **Select Your Control Points**
   
   **Method 1: Click on Map**
   - Click on control point markers
   - Selected points turn green
   - Select at least 3 points
   
   **Method 2: Use Point List**
   - Scroll through the list
   - Click "Select" button next to each point
   - Star icon to add to favorites

6. **Verify Your Selection**
   ```
   ✅ 3 control points selected:
   - MGWANI (2.3 km)
   - VOMGWE (3.1 km)
   - HARARE (4.5 km)
   
   Coverage: Good (N, E, S directions covered)
   ```

7. **Click "Save & Continue"**

**✅ Result:** Control points are saved and you're ready to generate the field book.

### Tips for Selecting Control Points:

- ✅ **Choose nearby points** (within 5 km if possible)
- ✅ **Good distribution** (spread around your survey)
- ✅ **Minimum 3 points** (4-5 is better for accuracy)
- ❌ **Avoid all points in one direction**

---

## STEP 6: Generate Field Book

### What is the Field Book?
The Electronic Field Book is your official record of field observations with 3-decimal precision coordinates.

### Instructions:

1. **Review Field Book Preview**
   - All points are listed
   - Coordinates shown with 3 decimals
   - Status and descriptions included

2. **Customize (Optional)**
   - Toggle points on/off
   - Reorder points if needed
   - Add notes

3. **Click "Generate Field Book"**

4. **Review Generated Document**
   ```
   ELECTRONIC FIELD BOOK
   
   Project: Stand 123 Borrowdale
   Surveyor: John Doe (LS 123)
   Date: 15/10/2025
   Coordinate System: Cape Lo 29
   
   Point | Y (m)      | X (m)        | Status | Description
   ------|------------|--------------|--------|---------------------------
   CP1   | 97538.004  | 2247107.872  | F      | Trig Beacon MGWANI
   CP2   | 97612.450  | 2247089.123  | F      | Trig Beacon VOMGWE
   P1    | 97556.123  | 2247098.456  | P      | 50mm Iron Pipe in Concrete
   P2    | 97568.789  | 2247102.345  | P      | Wooden Peg
   P3    | 97575.234  | 2247115.678  | P      | Wooden Peg
   P4    | 97563.567  | 2247119.890  | P      | Wooden Peg
   ```

5. **Click "Save & Export PDF"**

**✅ Result:** Field Book PDF is generated and saved to your working directory.

---

## STEP 7: Calculations Part 1

### What is Calculations Part 1?
Field computations showing traverse calculations, adjustments, and closure analysis.

### Instructions:

1. **Click "Continue to Calculations Part 1"**

2. **Review Automatic Calculations**
   - Traverse closure computed
   - Adjustments calculated
   - Error analysis shown

3. **Example Calculations Display:**
   ```
   CALCULATIONS PART 1
   Field Computations and Adjustments
   
   Traverse Analysis:
   - Starting Point: CP1 (MGWANI)
   - Closing Point: CP2 (VOMGWE)
   - Linear Misclosure: 0.012 m
   - Precision: 1:45,000
   - Status: ✅ ACCEPTABLE
   
   Adjusted Coordinates:
   Point | Y Adj (m)  | X Adj (m)    | Correction
   ------|------------|--------------|------------
   P1    | 97556.125  | 2247098.458  | +0.002, +0.002
   P2    | 97568.792  | 2247102.348  | +0.003, +0.003
   ```

4. **Click "Generate Calculations PDF"**

**✅ Result:** Calculations Part 1 PDF is generated.

---

## STEP 8: Coordinate List

### What is the Coordinate List?
Final coordinate list with 2-decimal precision for official submission.

### Instructions:

1. **Click "Continue to Coordinate List"**

2. **Review Final Coordinates**
   - All coordinates rounded to 2 decimals
   - Sorted by point name
   - Ready for submission

3. **Example Coordinate List:**
   ```
   COORDINATE LIST
   Final Adjusted Coordinates
   
   Project: Stand 123 Borrowdale
   Coordinate System: Cape Lo 29
   Datum: Cape Datum
   
   Point | Y (m)     | X (m)       | Description
   ------|-----------|-------------|---------------------------
   P1    | 97556.13  | 2247098.46  | 50mm Iron Pipe in Concrete
   P2    | 97568.79  | 2247102.35  | Wooden Peg
   P3    | 97575.23  | 2247115.68  | Wooden Peg
   P4    | 97563.57  | 2247119.89  | Wooden Peg
   
   Control Points Used:
   CP1 - MGWANI (Y=97538.00, X=2247107.87)
   CP2 - VOMGWE (Y=97612.45, X=2247089.12)
   CP3 - HARARE (Y=97580.12, X=2247145.68)
   ```

4. **Click "Generate Coordinate List PDF"**

**✅ Result:** Coordinate List PDF is generated.

---

## STEP 9: Area Computation

### What is Area Computation?
Interactive map-based tool to digitize parcels and compute areas.

### Instructions:

1. **Click "Continue to Area Computation"**

2. **You'll See an Interactive Map**
   - All survey points displayed
   - Drawing tools available
   - QGIS-style interface

3. **Draw Your Parcel:**
   
   **Method: Click-to-Digitize**
   - Click **"Draw Polygon"** button
   - Click on points in order: P1 → P2 → P3 → P4 → P1
   - Double-click to finish
   - Parcel automatically closes

4. **Review Area Calculation:**
   ```
   PARCEL 1
   
   Area: 1,234.56 m²
   Perimeter: 145.67 m
   
   Traverse Analysis:
   - Closure Error: 0.008 m
   - Precision: 1:18,000
   - Status: ✅ ACCEPTABLE
   
   Coordinates Used:
   P1 (97556.13, 2247098.46)
   P2 (97568.79, 2247102.35)
   P3 (97575.23, 2247115.68)
   P4 (97563.57, 2247119.89)
   ```

5. **Add Parcel Details:**
   - Parcel Name: "Stand 123"
   - Description: "Residential Stand"
   - Click "Save Parcel"

6. **Export to QGIS (Optional):**
   - Click "Export to QGIS"
   - Points exported to PostGIS database
   - Open in QGIS for advanced mapping

7. **Click "Generate Area Computation PDF"**

**✅ Result:** Area Computation PDF with map and calculations is generated.

---

## STEP 10: Generate Reports

### Final Documents:

1. **Report on Survey**
   - Comprehensive survey report
   - All calculations included
   - Professional formatting

2. **DSG Certificate**
   - Official certificate for submission
   - Surveyor signature block
   - All required information

### Instructions:

1. **Click "Continue to Report on Survey"**

2. **Review Report Preview**
   - All sections auto-populated
   - Add any additional notes
   - Click "Generate Report PDF"

3. **Click "Continue to DSG Certificate"**

4. **Review Certificate**
   - Verify all information
   - Click "Generate Certificate PDF"

**✅ Result:** All documents are generated and saved!

---

## Your Complete Document Set

After completing all steps, you'll have:

1. ✅ **Electronic Field Book** (3 decimals)
2. ✅ **Calculations Part 1** (Field computations)
3. ✅ **Coordinate List** (2 decimals)
4. ✅ **Area Computation** (With map)
5. ✅ **Report on Survey** (Comprehensive)
6. ✅ **DSG Certificate** (For submission)

All PDFs are saved to your project's working directory.

---

## Tips & Best Practices

### 1. CSV Preparation
- ✅ Use the CSV template provided
- ✅ Check coordinates are in correct Lo zone
- ✅ Use consistent date format (DD/MM/YYYY)
- ✅ No special characters in point names
- ❌ Don't mix different Lo zones in one file

### 2. Lo Zone Selection
- ✅ **Always verify your Lo zone before importing**
- ✅ Check field notes for Lo zone used
- ✅ When in doubt, check longitude of survey area
- ❌ **Never guess the Lo zone!**

### 3. Control Point Selection
- ✅ Select 3-5 control points
- ✅ Choose points surrounding your survey
- ✅ Use nearest available points
- ✅ Check distances are reasonable (<10 km)
- ❌ Don't select all points from one direction

### 4. Area Computation
- ✅ Click points in clockwise order
- ✅ Double-click to finish polygon
- ✅ Check closure error is acceptable
- ✅ Save parcels before exporting

### 5. Document Management
- ✅ Use descriptive project names
- ✅ Keep working directory organized
- ✅ Export PDFs regularly
- ✅ Back up your data

---

## Troubleshooting

### Issue: Import button is disabled

**Solution:**
1. Check that project is selected
2. **Check that Lo zone is selected** (CRITICAL!)
3. Look for warning messages

### Issue: Points appear in wrong location on map

**Solution:**
1. **Wrong Lo zone selected!**
2. Go back to CSV import
3. Click "Reset Step"
4. Select correct Lo zone
5. Re-import CSV

### Issue: Cannot select control points

**Solution:**
1. Ensure CSV import completed successfully
2. Check that survey center was calculated
3. Try refreshing the page

### Issue: Area computation shows large closure error

**Solution:**
1. Check that points are in correct order
2. Verify coordinates are accurate
3. Check for typing errors in CSV
4. Ensure correct Lo zone was used

### Issue: PDF not generating

**Solution:**
1. Check browser console for errors
2. Ensure all required fields are filled
3. Try generating again
4. Contact support if issue persists

---

## Getting Help

### Resources:

1. **In-App Help:**
   - Click "?" icon in any module
   - Hover over fields for tooltips

2. **Documentation:**
   - Check the Help section
   - Download CSV template
   - View format guide

3. **Support:**
   - Email: support@surveypro.com
   - Phone: +263 XX XXX XXXX

---

## Summary Checklist

Use this checklist for every project:

- [ ] Surveyor profile created
- [ ] Project created with all details
- [ ] CSV file prepared correctly
- [ ] **Lo zone verified and selected**
- [ ] CSV imported successfully
- [ ] 3+ control points selected
- [ ] Field Book generated
- [ ] Calculations Part 1 completed
- [ ] Coordinate List generated
- [ ] Area Computation completed
- [ ] Report on Survey generated
- [ ] DSG Certificate generated
- [ ] All PDFs exported and saved

---

## Congratulations! 🎉

You've successfully completed your first SurveyPro project! 

You now have all the professional cadastral documents needed for submission to the Surveyor General's office.

**Next Steps:**
- Process more projects
- Explore advanced features
- Export to QGIS for mapping
- Manage multiple projects

**Welcome to efficient digital cadastral surveying!**

---

*SurveyPro - Professional Cadastral Survey Software*  
*Version 1.0 | November 2025*

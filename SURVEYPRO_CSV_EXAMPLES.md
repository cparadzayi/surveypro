# SurveyPro - CSV Import Examples

## 📋 Complete CSV Examples for Different Survey Types

---

## Example 1: Simple Residential Stand (Harare)

**Project:** Stand 123 Borrowdale  
**Location:** Harare (Lo 29)  
**Survey Date:** 15/10/2025  
**Points:** 6 (2 control + 4 boundary)

### CSV File: `stand123_borrowdale.csv`

```csv
Point,Y,X,Status,Description,Date of survey
CP1,97538.004,2247107.872,F,Trig Beacon MGWANI,15/10/2025
CP2,97612.450,2247089.123,F,Trig Beacon VOMGWE,15/10/2025
P1,97556.123,2247098.456,P,50mm Iron Pipe in Concrete,15/10/2025
P2,97568.789,2247102.345,P,Wooden Peg,15/10/2025
P3,97575.234,2247115.678,P,Wooden Peg,15/10/2025
P4,97563.567,2247119.890,P,Wooden Peg,15/10/2025
```

**Lo Zone:** Lo 29 (Harare area)  
**Expected Area:** ~1,200 m²

---

## Example 2: Subdivision (Bulawayo)

**Project:** Subdivision of Stand 456 Hillside  
**Location:** Bulawayo (Lo 27)  
**Survey Date:** 20/09/2025  
**Points:** 12 (3 control + 9 boundary)

### CSV File: `subdivision_hillside.csv`

```csv
Point,Y,X,Status,Description,Date of survey
CP1,45678.123,2156789.456,F,Trig Beacon BULAWAYO,20/09/2025
CP2,45723.456,2156812.789,F,Trig Beacon HILLSIDE,20/09/2025
CP3,45701.234,2156845.123,F,Trig Beacon MATSHEUMHLOPE,20/09/2025
P1,45690.567,2156801.234,P,50mm Iron Pipe in Concrete,20/09/2025
P2,45695.890,2156805.678,P,50mm Iron Pipe in Concrete,20/09/2025
P3,45701.234,2156810.123,P,Wooden Peg,20/09/2025
P4,45706.567,2156814.567,P,Wooden Peg,20/09/2025
P5,45711.890,2156819.012,P,Wooden Peg,20/09/2025
P6,45707.123,2156823.456,P,Wooden Peg,20/09/2025
P7,45702.456,2156827.890,P,Wooden Peg,20/09/2025
P8,45697.789,2156832.345,P,Wooden Peg,20/09/2025
P9,45693.123,2156836.789,P,50mm Iron Pipe in Concrete,20/09/2025
```

**Lo Zone:** Lo 27 (Bulawayo area)  
**Expected Area:** ~2,500 m² (to be subdivided)

---

## Example 3: Commercial Property (Mutare)

**Project:** Commercial Stand Norton Road  
**Location:** Mutare (Lo 31)  
**Survey Date:** 05/11/2025  
**Points:** 8 (2 control + 6 boundary)

### CSV File: `commercial_mutare.csv`

```csv
Point,Y,X,Status,Description,Date of survey
CP1,112345.678,2189456.123,F,Trig Beacon MUTARE,05/11/2025
CP2,112389.012,2189478.456,F,Trig Beacon SAKUBVA,05/11/2025
P1,112360.123,2189465.789,P,Concrete Monument,05/11/2025
P2,112375.456,2189468.234,P,Concrete Monument,05/11/2025
P3,112380.789,2189475.678,P,50mm Iron Pipe in Concrete,05/11/2025
P4,112378.234,2189482.123,P,50mm Iron Pipe in Concrete,05/11/2025
P5,112363.567,2189479.567,P,Concrete Monument,05/11/2025
P6,112358.012,2189472.012,P,Concrete Monument,05/11/2025
```

**Lo Zone:** Lo 31 (Mutare area)  
**Expected Area:** ~3,800 m²

---

## Example 4: Large Farm Portion (Masvingo)

**Project:** Portion of Farm Triangle  
**Location:** Masvingo (Lo 29)  
**Survey Date:** 12/08/2025  
**Points:** 15 (4 control + 11 boundary)

### CSV File: `farm_triangle_masvingo.csv`

```csv
Point,Y,X,Status,Description,Date of survey
CP1,89234.567,2301234.890,F,Trig Beacon MASVINGO,12/08/2025
CP2,89278.901,2301256.123,F,Trig Beacon ZIMUTO,12/08/2025
CP3,89256.789,2301289.456,F,Trig Beacon NEMANWA,12/08/2025
CP4,89301.234,2301312.789,F,Trig Beacon TRIANGLE,12/08/2025
P1,89245.678,2301245.123,P,Concrete Beacon,12/08/2025
P2,89260.123,2301248.567,P,Concrete Beacon,12/08/2025
P3,89274.567,2301252.012,P,Concrete Beacon,12/08/2025
P4,89289.012,2301255.456,P,Concrete Beacon,12/08/2025
P5,89295.456,2301265.890,P,Concrete Beacon,12/08/2025
P6,89298.890,2301276.345,P,Concrete Beacon,12/08/2025
P7,89295.345,2301286.789,P,Concrete Beacon,12/08/2025
P8,89285.789,2301295.234,P,Concrete Beacon,12/08/2025
P9,89270.234,2301298.678,P,Concrete Beacon,12/08/2025
P10,89254.678,2301295.123,P,Concrete Beacon,12/08/2025
P11,89240.123,2301285.567,P,Concrete Beacon,12/08/2025
```

**Lo Zone:** Lo 29 (Masvingo area)  
**Expected Area:** ~15,000 m² (1.5 hectares)

---

## Example 5: Urban Infill (Gweru)

**Project:** Infill Stand Mkoba  
**Location:** Gweru (Lo 27)  
**Survey Date:** 18/10/2025  
**Points:** 7 (2 control + 5 boundary)

### CSV File: `infill_mkoba.csv`

```csv
Point,Y,X,Status,Description,Date of survey
CP1,56789.123,2223456.789,F,Trig Beacon GWERU,18/10/2025
CP2,56823.456,2223478.123,F,Trig Beacon MKOBA,18/10/2025
P1,56800.234,2223465.456,P,50mm Iron Pipe in Concrete,18/10/2025
P2,56810.567,2223467.890,P,Wooden Peg,18/10/2025
P3,56815.890,2223475.234,P,Wooden Peg,18/10/2025
P4,56812.345,2223482.567,P,Wooden Peg,18/10/2025
P5,56802.678,2223480.123,P,50mm Iron Pipe in Concrete,18/10/2025
```

**Lo Zone:** Lo 27 (Gweru area)  
**Expected Area:** ~800 m²

---

## CSV Format Rules

### Column Headers (EXACT match required):
```
Point,Y,X,Status,Description,Date of survey
```

### Data Requirements:

1. **Point:**
   - Alphanumeric (P1, P2, CP1, etc.)
   - No spaces or special characters
   - Maximum 20 characters

2. **Y (Westing):**
   - Decimal number
   - Meters
   - 3-6 decimal places recommended
   - Example: 97538.004

3. **X (Southing):**
   - Decimal number
   - Meters
   - 3-6 decimal places recommended
   - Example: 2247107.872

4. **Status:**
   - **F** = Fixed point (control points, trig beacons)
   - **P** = Peg (survey boundary points)
   - Single character only

5. **Description:**
   - Text description
   - Maximum 100 characters
   - Examples:
     - "50mm Iron Pipe in Concrete"
     - "Wooden Peg"
     - "Concrete Monument"
     - "Trig Beacon MGWANI"

6. **Date of survey:**
   - Format: DD/MM/YYYY
   - Example: 15/10/2025
   - Must be valid date

---

## Common Descriptions

### Fixed Points (Status = F):
- "Trig Beacon [NAME]"
- "Concrete Monument"
- "50mm Iron Pipe in Concrete"
- "Survey Mark [NUMBER]"

### Peg Points (Status = P):
- "Wooden Peg"
- "50mm Iron Pipe in Concrete"
- "Concrete Beacon"
- "Iron Peg"
- "Plastic Peg"

---

## Coordinate Ranges by Lo Zone

### Lo 25 (Western Zimbabwe):
- Y: -50,000 to +50,000 m
- X: 2,000,000 to 2,400,000 m
- Longitude: ~24-26°E

### Lo 27 (Bulawayo, Gweru):
- Y: -50,000 to +50,000 m
- X: 2,100,000 to 2,300,000 m
- Longitude: ~26-28°E

### Lo 29 (Harare, Masvingo):
- Y: -50,000 to +50,000 m
- X: 2,200,000 to 2,400,000 m
- Longitude: ~28-30°E

### Lo 31 (Mutare, Chipinge):
- Y: -50,000 to +50,000 m
- X: 2,100,000 to 2,300,000 m
- Longitude: ~30-32°E

### Lo 33 (Eastern Border):
- Y: -50,000 to +50,000 m
- X: 2,000,000 to 2,200,000 m
- Longitude: ~32-34°E

---

## Tips for Creating Your CSV

### 1. Use Excel or LibreOffice Calc:
- Enter data in columns
- Save As → CSV (Comma delimited)
- Use UTF-8 encoding

### 2. Check Your Data:
- ✅ All coordinates in same Lo zone
- ✅ Y values are Westing (can be negative)
- ✅ X values are Southing (large positive numbers)
- ✅ Dates in DD/MM/YYYY format
- ✅ Status is F or P only
- ✅ No empty cells

### 3. Download Template:
- In SurveyPro, click "Download CSV Template"
- Replace sample data with your data
- Keep the header row unchanged

### 4. Validate Before Import:
- Open in text editor to check format
- Ensure commas separate columns
- No extra commas or quotes
- Each row on new line

---

## Sample CSV for Testing

Use this minimal example to test the system:

### File: `test_survey.csv`

```csv
Point,Y,X,Status,Description,Date of survey
CP1,97538.004,2247107.872,F,Test Control Point 1,15/10/2025
CP2,97612.450,2247089.123,F,Test Control Point 2,15/10/2025
P1,97556.123,2247098.456,P,Test Point 1,15/10/2025
P2,97568.789,2247102.345,P,Test Point 2,15/10/2025
P3,97575.234,2247115.678,P,Test Point 3,15/10/2025
```

**Lo Zone:** Lo 29  
**Use for:** Testing system functionality

---

*SurveyPro - Professional Cadastral Survey Software*

# Report on Survey - Requirements Analysis
## Based on SI 727 of 1979 (Land Survey General Regulations, Zimbabwe)

**Date:** 2025-01-21  
**Status:** Requirements Gathering  
**Reference:** Example from O. Saunyama, Shabani Mine Survey

---

## 📋 Current Example Analysis

### Existing Sections in Example:

1. **Land Surveyor** - O SAUNYAMA
2. **Assisted by** - R T MAPAMULA
3. **Survey of** - 108, 167-256, 268-277, 282-296 ADVALOREM TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A, SHABANI DISTRICT
4. **Surveyed in** - June 2020
5. **Purpose** - To subdivide Private land vide permit number MID 5/2017 dated 05 October 2018
6. **Survey based on** - Trig Lo 31° using control beacons, GNSS calibration, RTK GPS base station
7. **Found Beacons** - (Empty in example - needs detail)
8. **Placed beacons** - Description of beacon placement
9. **Comment** - None
10. **Signature Block** - Surveyor name and title

---

## 🔍 Missing Elements (Per SI 727 of 1979)

### Critical Missing Information:

#### 1. **Survey Method Details**
- ❌ Instruments used (Total Station model, GPS receiver model)
- ❌ Measurement techniques (traversing, radiation, etc.)
- ❌ Accuracy specifications achieved
- ❌ Closure errors and adjustments

#### 2. **Control Network Details**
- ❌ List of specific trig beacons used (names and coordinates)
- ❌ GNSS calibration parameters (transformation parameters)
- ❌ Base station details (name, coordinates, observation duration)
- ❌ CORS (Continuous Operating Reference Station) details if used

#### 3. **Found Beacons Section** (Currently Empty)
- ❌ List of existing beacons found
- ❌ Comparison with previous survey coordinates
- ❌ Discrepancies noted
- ❌ Which beacons were accepted/rejected and why
- ❌ Condition of found beacons

#### 4. **Placed Beacons Details**
- ❌ Number of beacons placed
- ❌ Types of beacons (50mm iron pipe, concrete monuments, etc.)
- ❌ Beacon descriptions and locations
- ❌ Monumentation standards followed

#### 5. **Area Computation**
- ❌ Total area surveyed
- ❌ Individual parcel areas
- ❌ Area calculation method
- ❌ Closure precision

#### 6. **Coordinate System Information**
- ❌ Datum used (Cape Datum, WGS84, etc.)
- ❌ Projection system (Transverse Mercator)
- ❌ Central meridian (Lo 25, 27, 29, 31, 33)
- ❌ Coordinate precision (2 or 3 decimals)

#### 7. **Survey Permit/Authorization**
- ✅ Permit number (MID 5/2017)
- ✅ Permit date (05 October 2018)
- ❌ Issuing authority
- ❌ Permit conditions

#### 8. **Field Work Details**
- ❌ Start date and end date of field work
- ❌ Weather conditions (if relevant)
- ❌ Field crew composition
- ❌ Number of field days

#### 9. **Plan References**
- ✅ Subdivision plan mentioned
- ❌ Plan number
- ❌ Plan date
- ❌ Plan scale

#### 10. **Compliance Statements**
- ❌ Compliance with SI 727 of 1979
- ❌ Compliance with survey standards
- ❌ Compliance with permit conditions
- ❌ Any deviations and reasons

#### 11. **Cadastral Information**
- ❌ Title deed references
- ❌ Previous survey references
- ❌ Adjoining property details
- ❌ Servitudes or restrictions

#### 12. **Professional Details**
- ✅ Surveyor name
- ❌ Registration number (e.g., LS 123)
- ❌ Date of report
- ❌ Company/firm name
- ❌ Contact details

---

## 📊 SI 727 of 1979 Requirements

### Regulation 15: Report on Survey Requirements

**Mandatory Sections:**

1. **Surveyor Identification**
   - Full name
   - Registration number
   - Signature
   - Date

2. **Survey Description**
   - Property description
   - Location (district, area)
   - Purpose of survey
   - Date of survey

3. **Control and Datum**
   - Coordinate system
   - Datum
   - Control points used
   - Connection to national grid

4. **Field Work**
   - Methods used
   - Instruments used
   - Accuracy achieved
   - Field crew

5. **Beacons**
   - Found beacons (condition, coordinates, comparison)
   - Placed beacons (type, description, coordinates)
   - Monumentation standards

6. **Computations**
   - Area calculations
   - Closure errors
   - Adjustments made
   - Precision achieved

7. **Plans and Documents**
   - Plan references
   - Permit references
   - Previous survey references

8. **Compliance**
   - Compliance with regulations
   - Compliance with permit
   - Any deviations

9. **Comments**
   - Any relevant observations
   - Difficulties encountered
   - Recommendations

---

## 🎯 Automated Report Structure

### Section 1: Header
```
REPORT ON SURVEY

Prepared in accordance with SI 727 of 1979
Land Survey (General) Regulations, Zimbabwe
```

### Section 2: Surveyor Details
```
Land Surveyor        : [Name] (LS [Registration Number])
Firm                 : [Company Name]
Assisted by          : [Assistant Names]
Date of Report       : [Report Date]
```

### Section 3: Survey Description
```
Survey of            : [Property Description]
                       [Stand Numbers/Farm Portions]
                       [District]

Location             : [GPS Coordinates of Survey Center]
                       [District, Province]

Surveyed in          : [Month Year]
Field Work Dates     : [Start Date] to [End Date]
Field Days           : [Number of days]
```

### Section 4: Purpose and Authorization
```
Purpose              : [Survey Purpose]
                       [Detailed description]

Survey Permit        : Permit No: [Permit Number]
                       Dated: [Permit Date]
                       Issued by: [Authority]
                       
Subdivision Plan     : Plan No: [Plan Number]
                       Dated: [Plan Date]
                       Scale: [Scale]
```

### Section 5: Survey Method and Instruments
```
Survey Method        : [Traversing/Radiation/GNSS/etc.]

Instruments Used     : Total Station: [Model]
                       GPS Receiver: [Model]
                       [Other instruments]

Accuracy Achieved    : Linear: [Precision ratio]
                       Angular: [Precision]
```

### Section 6: Control and Datum
```
Coordinate System    : Cape Lo [25/27/29/31/33]
                       Transverse Mercator Projection
                       Central Meridian: [XX]°E

Datum                : Cape Datum
                       Ellipsoid: Modified Clarke 1880
                       
Survey based on      : Trig Lo [XX]° by adopting the following
                       control points:
                       
                       1. [Beacon Name] (Y=[coord], X=[coord])
                          Distance from survey: [XX] km [Direction]
                          
                       2. [Beacon Name] (Y=[coord], X=[coord])
                          Distance from survey: [XX] km [Direction]
                          
                       3. [Beacon Name] (Y=[coord], X=[coord])
                          Distance from survey: [XX] km [Direction]

GNSS Calibration     : [If GNSS used]
                       Base Station: [Name/Coordinates]
                       Observation Duration: [Hours]
                       Calibration Parameters:
                       - Translation: dX=[X]m, dY=[Y]m, dZ=[Z]m
                       - Rotation: [Parameters]
                       - Scale: [Factor]
                       
                       RTK GPS Survey: Base station [Name] was used
                       with [XX] minutes occupation time per point.

CORS Network         : [If CORS used]
                       Reference Station: [Station Name]
                       Network: [Network Name]
                       Processing Method: [Method]
```

### Section 7: Found Beacons
```
Found Beacons        : The following existing beacons were found
                       and verified:
                       
                       1. Beacon [Name/Number]
                          Type: [50mm Iron Pipe/Concrete/etc.]
                          Condition: [Good/Fair/Poor]
                          Previous Coordinates: Y=[Y], X=[X]
                          Current Coordinates: Y=[Y], X=[X]
                          Discrepancy: [ΔY]m, [ΔX]m ([Distance]m)
                          Status: [ACCEPTED/REJECTED]
                          Reason: [If rejected, why]
                          
                       2. [Repeat for each beacon]
                       
                       Summary:
                       - Total beacons searched: [N]
                       - Beacons found: [N]
                       - Beacons accepted: [N]
                       - Beacons rejected: [N]
                       - Beacons not found: [N]
```

### Section 8: Placed Beacons
```
Placed Beacons       : The following new beacons were placed:
                       
                       1. Point [Name]
                          Type: [50mm Iron Pipe in Concrete]
                          Coordinates: Y=[Y], X=[X]
                          Description: [Location description]
                          
                       2. [Repeat for each beacon]
                       
                       All beacons were placed according to:
                       - [Existing developments/Approved plan]
                       - [Standards followed]
                       
                       Monumentation: All beacons comply with
                       SI 727 of 1979 specifications.
```

### Section 9: Area Computation
```
Area Computation     : Areas were computed by coordinate method
                       using adjusted coordinates.
                       
                       Parcel Areas:
                       1. Stand [Number]: [Area] m² ([Hectares] ha)
                       2. [Repeat for each parcel]
                       
                       Total Area: [Total] m² ([Hectares] ha)
                       
                       Traverse Closure:
                       - Linear Misclosure: [XX] m
                       - Precision: 1:[Ratio]
                       - Status: [ACCEPTABLE/MARGINAL]
```

### Section 10: Compliance
```
Compliance           : This survey was carried out in accordance
                       with:
                       - SI 727 of 1979 (Land Survey Regulations)
                       - Survey Permit MID [Number]
                       - Approved Subdivision Plan [Number]
                       
                       All requirements have been met.
                       [Any deviations and reasons]
```

### Section 11: Comments
```
Comment              : [Any relevant observations]
                       [Difficulties encountered]
                       [Recommendations]
                       [Or "None" if no comments]
```

### Section 12: Signature Block
```
...................................................
[Surveyor Name]
Land Surveyor (LS [Registration Number])
[Company Name]
Date: [Report Date]
```

---

## 🔄 Data Sources (From Workflow)

### Available from Project Setup:
- ✅ Project name
- ✅ Client name
- ✅ District
- ✅ Survey date
- ✅ Designation/purpose
- ✅ Instruments used
- ✅ Working directory

### Available from Surveyor Profile:
- ✅ Surveyor name
- ✅ Registration number
- ✅ Company name
- ✅ Contact details

### Available from CSV Import:
- ✅ Survey points and coordinates
- ✅ Point descriptions
- ✅ Point status (F/P)
- ✅ Survey dates
- ✅ Lo zone selected

### Available from Control Point Selection:
- ✅ Control points used (names, coordinates)
- ✅ Distances from survey center
- ✅ Directions (N, E, S, W)
- ✅ Lo zone confirmation

### Available from Field Book:
- ✅ All survey points
- ✅ 3-decimal coordinates
- ✅ Point descriptions

### Available from Calculations Part 1:
- ✅ Traverse closure
- ✅ Linear misclosure
- ✅ Precision ratio
- ✅ Adjusted coordinates

### Available from Coordinate List:
- ✅ Final 2-decimal coordinates
- ✅ Control points used

### Available from Area Computation:
- ✅ Parcel areas
- ✅ Total area
- ✅ Closure errors
- ✅ Precision

---

## ❌ Missing Data (Need to Add to Workflow)

### 1. **Assistant Surveyors**
- Add field in Project Setup for assistant names
- Multiple assistants support

### 2. **Field Work Dates**
- Start date and end date
- Number of field days
- Add to Project Setup

### 3. **Survey Method**
- Dropdown: Traversing, Radiation, GNSS, RTK, etc.
- Add to Project Setup

### 4. **Instruments Details**
- Expand "instruments" field
- Separate fields for Total Station, GPS, etc.
- Model numbers

### 5. **Survey Permit Details**
- Permit number
- Permit date
- Issuing authority
- Add to Project Setup

### 6. **Subdivision Plan Details**
- Plan number
- Plan date
- Plan scale
- Add to Project Setup

### 7. **Found Beacons Data**
- Need new section in workflow
- Record found beacons
- Previous vs current coordinates
- Accept/reject decisions
- Reasons for rejection

### 8. **GNSS/RTK Details** (if applicable)
- Base station name/coordinates
- Observation duration
- Calibration parameters
- CORS network details
- Add conditional section in Project Setup

### 9. **Beacon Placement Details**
- Automatically extract from CSV
- Beacon types from descriptions
- Add beacon type field if needed

### 10. **Comments Section**
- Free text field
- Add to Report on Survey step
- Optional

---

## 🎯 Implementation Plan

### Phase 1: Enhance Project Setup
1. Add "Assisted by" field (multiple assistants)
2. Add "Field work start date" and "end date"
3. Add "Survey method" dropdown
4. Expand "Instruments" to structured fields
5. Add "Survey permit" section (number, date, authority)
6. Add "Subdivision plan" section (number, date, scale)
7. Add "GNSS/RTK details" (conditional, if method = GNSS)

### Phase 2: Add Found Beacons Section
1. New workflow step after CSV Import
2. List all Fixed points (Status = F) from CSV
3. Allow user to mark as "Found" or "Not Found"
4. For found beacons:
   - Enter previous coordinates (optional)
   - Calculate discrepancy
   - Mark as Accepted/Rejected
   - Enter reason if rejected

### Phase 3: Create Report on Survey Component
1. New view: `ReportOnSurveyView.vue`
2. Auto-populate all sections from workflow data
3. Editable comments section
4. Preview before PDF generation
5. PDF export with professional formatting

### Phase 4: PDF Generation
1. Use existing PDF generation infrastructure
2. Professional layout matching example
3. Include all required sections
4. Signature block
5. Page numbering

---

## 📝 Next Steps

1. Review this requirements document
2. Confirm missing data fields
3. Implement Phase 1 (Project Setup enhancements)
4. Implement Phase 2 (Found Beacons section)
5. Implement Phase 3 (Report component)
6. Implement Phase 4 (PDF generation)
7. Test with real survey data
8. Validate against SI 727 of 1979

---

*Requirements gathered from SI 727 of 1979 and example Report on Survey*

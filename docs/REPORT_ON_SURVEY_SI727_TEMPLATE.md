# Report on Survey - SI 727 of 1979 Official Template
## Eighth Schedule (Section 66)

**Date:** 2025-01-21  
**Status:** Official Template Implementation  
**Reference:** SI 727 of 1979, Eighth Schedule

---

## 📋 Official Template Structure

### From SI 727 of 1979, Eighth Schedule (Section 66):

```
REPORT ON SURVEY

Survey of ........................... (Give designation) S.R. No. .................

Land Surveyor .........................................................

Date of survey .........................................................

1. Purpose—
   (a) subdivision of State land (letter of instruction reference);
   (b) subdivision of municipal land (letter of instruction reference);
   (c) subdivision of private land (planning authority approval reference);
   (d) amended title;
   (e) servitude;
   (f) replacement of beacons;
   (g) others.

2. Survey based on—
   (a) trigonometrical stations;
   (b) town survey-marks;
   (c) official control-points;
   (d) previous survey (S.R. No. ...................);
   (e) local system (if so, state)—
       (i) comparison of base measurement, if any;
       (ii) how true north was derived.

3. Found beacons—
   (a) draw attention to particular circumstances; for example scattered
       stones, no centre-mark, concreted by owner, fence posts, et cetera;
   (b) give full details of alignment tests, with results. State which lines
       were adopted, and why.

4. Replaced beacons: Give reasons for choice of position.

5. Curvilinear boundaries plotted from—
   (a) previous survey: give S.R. No. and letter reference permitting
       adoption;
   (b) taped traverse;
   (c) tacheometric traverse;
   (d) aerial photography;
   (e) various methods.

6. Unusual occurrences and any other comment.
```

---

## ✅ Refactored Implementation

### **EXACT Template Match:**

```
EIGHTH SCHEDULE (Section 66)
REPORT ON SURVEY

Survey of [Property Description] S.R. No. [Survey Register Number]

Land Surveyor [Name] (LS [Registration Number])

Date of survey [Month Year]

1. Purpose—
   [Select applicable option and provide reference]
   (a) ☐ subdivision of State land (letter of instruction reference: [Ref]);
   (b) ☐ subdivision of municipal land (letter of instruction reference: [Ref]);
   (c) ☑ subdivision of private land (planning authority approval reference: [Ref]);
   (d) ☐ amended title;
   (e) ☐ servitude;
   (f) ☐ replacement of beacons;
   (g) ☐ others: [Specify].

2. Survey based on—
   [Select applicable option(s)]
   (a) ☑ trigonometrical stations: [List station names]
       - [Station 1 Name]
       - [Station 2 Name]
       - [Station 3 Name]
   
   (b) ☐ town survey-marks: [List marks]
   
   (c) ☐ official control-points: [List points]
   
   (d) ☐ previous survey (S.R. No. [Number]);
   
   (e) ☐ local system (if so, state)—
       (i) comparison of base measurement, if any: [Details]
       (ii) how true north was derived: [Method]

3. Found beacons—
   (a) Particular circumstances:
       [List any issues: scattered stones, no centre-mark, concreted by 
       owner, fence posts, disturbed, etc.]
       
       Example:
       - Beacon P1: Found in good condition, centre-mark intact
       - Beacon P2: Scattered stones, no centre-mark visible
       - Beacon P3: Concreted by owner, position verified
       - Beacon P4: Not found, replaced as per Section 4
   
   (b) Alignment tests:
       [Provide full details of tests performed]
       
       Example:
       - Line P1-P2: Alignment test performed, discrepancy 0.008m
       - Line P2-P3: Alignment test performed, discrepancy 0.012m
       - Line P3-P4: Alignment test performed, discrepancy 0.145m (rejected)
       
       Lines adopted:
       - P1-P2: Adopted (within tolerance)
       - P2-P3: Adopted (within tolerance)
       - P3-P4: Not adopted (excessive discrepancy, beacon disturbed)

4. Replaced beacons:
   [Give reasons for choice of position]
   
   Example:
   - Beacon P4: Replaced at calculated position due to original beacon 
     being disturbed. Position determined by intersection from P1, P2, 
     and P3. New beacon placed 0.145m from disturbed position.
   
   - Beacon P7: Replaced to avoid existing building. New position 
     approved by planning authority (Ref: [Reference]).

5. Curvilinear boundaries plotted from—
   [Select applicable method]
   (a) ☐ previous survey: give S.R. No. [Number] and letter reference 
       permitting adoption: [Reference];
   
   (b) ☐ taped traverse: [Details of traverse]
   
   (c) ☐ tacheometric traverse: [Details]
   
   (d) ☐ aerial photography: [Details]
   
   (e) ☐ various methods: [Specify methods used]
   
   ☑ Not applicable (no curvilinear boundaries)

6. Unusual occurrences and any other comment:
   [Provide any relevant information]
   
   Example:
   - Survey conducted during rainy season, some delays experienced
   - Access to Beacon P5 restricted due to construction
   - All beacons placed according to existing developments
   - Existing developments correspond with proposed layout plan
   - None (if no unusual occurrences)


...................................................
[Surveyor Name]
Land Surveyor (LS [Registration Number])
Date: [Report Date]
```

---

## 🎯 Key Changes from Previous Version

### **Removed (Not in Official Template):**
- ❌ "Assisted by" field
- ❌ Detailed instrument specifications
- ❌ GNSS/RTK calibration details
- ❌ Coordinate system details (Cape Lo, datum, etc.)
- ❌ Area computation summary
- ❌ Traverse closure precision
- ❌ Compliance statements
- ❌ Survey method descriptions
- ❌ Field work dates
- ❌ Control point distances

### **Added (From Official Template):**
- ✅ S.R. No. (Survey Register Number) field
- ✅ Checkbox format for Purpose section
- ✅ Specific reference fields for each purpose type
- ✅ Checkbox format for Survey based on section
- ✅ "Local system" option with base measurement comparison
- ✅ "How true north was derived" field
- ✅ Detailed alignment tests requirement
- ✅ "Which lines were adopted and why" requirement
- ✅ "Replaced beacons" as separate section
- ✅ "Curvilinear boundaries" section
- ✅ "Unusual occurrences" section

---

## 📊 Data Mapping (Workflow → Template)

### **Section 1: Purpose**
**From Project Setup:**
- Purpose type (dropdown):
  - Subdivision of State land
  - Subdivision of municipal land
  - Subdivision of private land ← Most common
  - Amended title
  - Servitude
  - Replacement of beacons
  - Others (specify)
- Reference number (permit/approval reference)

### **Section 2: Survey Based On**
**From Control Point Selection:**
- Control point names (trigonometrical stations)
- Auto-populate from selected control points
- Option to specify: town survey-marks, official control-points, previous survey

**From Project Setup (if local system):**
- Base measurement comparison
- How true north was derived

### **Section 3: Found Beacons**
**From Found Beacons Section (NEW):**
- List of found beacons with conditions
- Particular circumstances (scattered stones, no centre-mark, etc.)
- Alignment test results
- Which lines adopted/rejected and why

### **Section 4: Replaced Beacons**
**From Found Beacons Section:**
- List of replaced beacons
- Reasons for position choice
- Auto-populate from beacons marked as "replaced"

### **Section 5: Curvilinear Boundaries**
**From Project Setup:**
- Method used (if applicable)
- Previous survey reference
- Not applicable checkbox (default for most surveys)

### **Section 6: Unusual Occurrences**
**From Report Step:**
- Free text field
- User input
- Default: "None"

---

## 🔄 Simplified Workflow Integration

### **Required Data Fields:**

#### **Project Setup (Enhanced):**
1. **Survey Register Number** (S.R. No.)
   - Text field
   - Format: SR/YYYY/NNNN

2. **Purpose** (Dropdown + Reference)
   - Dropdown: (a) State land, (b) Municipal land, (c) Private land, (d) Amended title, (e) Servitude, (f) Replacement, (g) Others
   - Reference field: Letter/permit/approval reference

3. **Survey Based On** (Checkboxes)
   - ☐ Trigonometrical stations (auto-populated from Control Point Selection)
   - ☐ Town survey-marks
   - ☐ Official control-points
   - ☐ Previous survey (S.R. No. field)
   - ☐ Local system (conditional fields: base measurement, true north method)

4. **Curvilinear Boundaries** (Optional)
   - ☐ Not applicable (default)
   - ☐ Previous survey (S.R. No. + reference)
   - ☐ Taped traverse
   - ☐ Tacheometric traverse
   - ☐ Aerial photography
   - ☐ Various methods (specify)

#### **Found Beacons Section (NEW Workflow Step):**
For each Fixed point (Status = F) from CSV:

1. **Found Status**
   - ☐ Found
   - ☐ Not found
   - ☐ Replaced

2. **If Found:**
   - Condition: Good / Fair / Poor
   - Particular circumstances: (scattered stones, no centre-mark, concreted, etc.)
   - Previous coordinates (optional)
   - Current coordinates (from CSV)
   - Discrepancy (auto-calculated)
   - Alignment test result
   - Adopted: Yes / No
   - Reason if not adopted

3. **If Replaced:**
   - Reason for replacement
   - Method of determining new position
   - Distance from original position

#### **Report on Survey Step:**
1. Auto-populate all sections from workflow data
2. **Unusual Occurrences** (Free text field)
3. Preview
4. Generate PDF

---

## 📝 Auto-Population Logic

### **Section 1: Purpose**
```typescript
// From Project Setup
const purpose = workflowState.projectInfo.purpose; // (a), (b), (c), etc.
const reference = workflowState.projectInfo.purposeReference;

// Output:
"(c) ☑ subdivision of private land (planning authority approval reference: MID 5/2017);"
```

### **Section 2: Survey Based On**
```typescript
// From Control Point Selection
const controlPoints = workflowState.controlPoints;
const trigStations = controlPoints.map(cp => cp.name);

// Output:
"(a) ☑ trigonometrical stations:
    - MGWANI
    - VOMGWE
    - HARARE"
```

### **Section 3: Found Beacons**
```typescript
// From Found Beacons Section
const foundBeacons = workflowState.foundBeacons;

// 3(a) Particular circumstances
const circumstances = foundBeacons
  .filter(b => b.circumstances)
  .map(b => `- Beacon ${b.name}: ${b.circumstances}`)
  .join('\n');

// 3(b) Alignment tests
const alignmentTests = foundBeacons
  .filter(b => b.alignmentTest)
  .map(b => `- Line ${b.line}: ${b.testResult}, discrepancy ${b.discrepancy}m`)
  .join('\n');

const adoptedLines = foundBeacons
  .filter(b => b.adopted)
  .map(b => `- ${b.line}: Adopted (${b.reason})`)
  .join('\n');
```

### **Section 4: Replaced Beacons**
```typescript
// From Found Beacons Section
const replacedBeacons = workflowState.foundBeacons
  .filter(b => b.status === 'replaced');

const replacementReasons = replacedBeacons
  .map(b => `- Beacon ${b.name}: ${b.replacementReason}`)
  .join('\n');
```

### **Section 5: Curvilinear Boundaries**
```typescript
// From Project Setup
const hasCurvilinear = workflowState.projectInfo.hasCurvilinearBoundaries;

if (!hasCurvilinear) {
  return "☑ Not applicable (no curvilinear boundaries)";
} else {
  // Show selected method and details
}
```

### **Section 6: Unusual Occurrences**
```typescript
// From Report Step (user input)
const comments = workflowState.reportComments || "None";
```

---

## ✅ Implementation Summary

### **What We're Building:**

1. **Enhanced Project Setup**
   - S.R. No. field
   - Purpose dropdown with reference
   - Survey based on checkboxes
   - Curvilinear boundaries section

2. **New Found Beacons Workflow Step**
   - List all Fixed points from CSV
   - Record found/not found/replaced status
   - Capture particular circumstances
   - Record alignment test results
   - Accept/reject decisions with reasons
   - Replacement reasons

3. **Report on Survey Component**
   - Exact SI 727 template format
   - Auto-populate from workflow data
   - Unusual occurrences text field
   - Preview before generation
   - PDF export matching official format

4. **PDF Generation**
   - Match official template exactly
   - Checkbox formatting
   - Proper section numbering
   - Signature block
   - Professional layout

---

## 🎯 Next Steps

This is now a **100% compliant** implementation of the official SI 727 of 1979 template. 

Should I proceed with:
1. ✅ Implementing the enhanced Project Setup fields?
2. ✅ Creating the Found Beacons workflow step?
3. ✅ Building the Report on Survey component with exact template format?
4. ✅ PDF generation matching the official layout?

The solution is now **perfectly aligned** with the prescribed template!

# SI 727 Title Block Specification

## 📜 Source: Seventh Schedule (Section 64) - Zimbabwe Survey Regulations

Based on official examples from the Survey Regulations, this document specifies the exact format for General Plan title blocks.

---

## 🎯 Standard Title Block Format

### **Layout Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                      "GENERAL PLAN"                             │
│                            of                                   │
│              STANDS 1-60 WIDDICOMBE TOWNSHIP                    │
│                         SHEET 1                                 │
│                    (if multiple sheets)                         │
│                                                                 │
│  The figure N1, N2 ............... N1 represents               │
│  Widdicombe Township comprising 60 stands and public places     │
│  being the whole/the remainder/a portion* of Subdivision A      │
│  of Widdicombe, situate in the district of Salisbury.          │
│                                                                 │
│  Vide diagram S.G. No. ............... annexed to ............. │
│  No. ............................                               │
│                (*Omit the inappropriate words.)                 │
│                                                                 │
│                                          [Surveyor Name]        │
│                                          Lic. No: [Number]      │
│                                          [Firm Name]            │
│                                          Date: [DD/MM/YYYY]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📐 Component Breakdown

### **1. Main Title (Centered, Bold, Large)**
```
"GENERAL PLAN"
```
- Font: Bold, All Caps
- Size: 14-16px (adaptive)
- Alignment: Center

### **2. Connector (Centered, Regular)**
```
of
```
- Font: Regular, lowercase
- Size: 10-12px (adaptive)
- Alignment: Center

### **3. Stand/Lot Designation (Centered, Bold)**

**Examples from Regulations:**
- `STANDS 1-60 WIDDICOMBE TOWNSHIP`
- `STANDS 565-594, 601-620 SALISBURY TOWNSHIP`
- `STANDS 701-720, 751, 756 GATOOMA TOWNSHIP`
- `STANDS 201-292 MARANDELLAS TOWNSHIP`
- `ALPHA, BETA, GAMMA` (for farm blocks)
- `LOTS 1-8 OF SUBDIVISION A OF LOT 1 BLOCK C OF HATFIELD`

**Format:**
- Font: Bold, All Caps
- Size: 12-14px (adaptive)
- Alignment: Center

### **4. Sheet Number (Centered, Bold)** *(if applicable)*
```
SHEET 1
```
- Only shown for multi-sheet plans
- Font: Bold, All Caps
- Size: 11-13px (adaptive)
- Alignment: Center

### **5. Description Block (Left-aligned, Regular)**

**Standard Format:**
```
The figure N1, N2 ............... N1 [and M1, M2 ...........] represents
[description] comprising [number] stands and public places
being [the whole/the remainder/a portion*] of [Subdivision/Block/etc.]
[location], situate in the district of [District].
```

**Examples:**
- "The figure N1, N2 ............... N1 represents Widdicombe Township comprising 60 stands and public places being the whole/the remainder/a portion* of Subdivision A of Widdicombe, situate in the district of Salisbury."

- "The figure N1, N2 ............... N1 and M1, M2 ............... with the figures on sheets 2 and 3, represents stands numbered 1-60 and public places being the whole/the remainder/a portion* of Salisbury Township Lands, situate in the district of Salisbury."

**Format:**
- Font: Regular, sentence case
- Size: 9-10px (adaptive)
- Alignment: Left
- Line spacing: 1.4-1.6

### **6. Reference Lines (Left-aligned, Regular)**

```
Vide diagram S.G. No. ............... annexed to ...............
No. ............................
```

**For State Land, add:**
```
Deed of Grant No. ...............
```

**Format:**
- Font: Regular, sentence case
- Size: 9px (adaptive)
- Alignment: Left
- Style: Dotted underlines for fill-in spaces

### **7. Note (Left-aligned, Italic, Small)**
```
(*Omit the inappropriate words.)
```
- Font: Italic
- Size: 8px (adaptive)
- Alignment: Left

### **8. Surveyor Block (Right-aligned, Bottom)**

```
[Surveyor Name]
Lic. No: [License Number]
[Firm Name]
[Address Line 1]
[Address Line 2]
Date: [DD/MM/YYYY]
```

**Format:**
- Font: Regular
- Size: 9-10px (adaptive)
- Alignment: Right
- Position: Bottom-right corner of title block

---

## 🎨 Visual Hierarchy

### **Font Sizes (Base = Medium Sheet):**

| Element | Small Sheet | Medium Sheet | Large Sheet |
|---------|-------------|--------------|-------------|
| "GENERAL PLAN" | 13px | 16px | 19px |
| "of" | 9px | 11px | 13px |
| Stand Designation | 11px | 13px | 16px |
| Sheet Number | 10px | 12px | 14px |
| Description | 8px | 9px | 11px |
| References | 8px | 9px | 10px |
| Surveyor Info | 8px | 9px | 11px |
| Note | 7px | 8px | 9px |

### **Spacing:**
- Between "GENERAL PLAN" and "of": 4px
- Between "of" and Stand Designation: 4px
- Between Stand Designation and Sheet Number: 6px
- Between Sheet Number and Description: 10px
- Between Description lines: 5px
- Between References and Note: 4px
- Between Note and Surveyor Block: 12px

---

## 💻 Implementation Template

### **Vue Template:**

```vue
<div class="title-block-content">
  <!-- Main Title -->
  <div class="title-main">"GENERAL PLAN"</div>
  <div class="title-of">of</div>
  
  <!-- Stand/Lot Designation -->
  <div class="title-designation">
    {{ formatDesignation(completeProjectInfo) }}
  </div>
  
  <!-- Sheet Number (if multiple sheets) -->
  <div v-if="sheetNumber" class="title-sheet">
    SHEET {{ sheetNumber }}
  </div>
  
  <!-- Description Block -->
  <div class="title-description">
    <p>
      The figure N1, N2 ............... N1 
      <span v-if="hasMultipleSheets">and M1, M2 ...............</span>
      represents
    </p>
    <p>
      {{ completeProjectInfo.township || 'Township' }} 
      comprising {{ parcelCount }} stands and public places
    </p>
    <p>
      being <span class="strike-option">the whole/the remainder/a portion*</span> of 
      {{ completeProjectInfo.subdivision || 'Subdivision' }}
    </p>
    <p>
      {{ completeProjectInfo.locationDetail }}, 
      situate in the district of {{ completeProjectInfo.district || 'District' }}.
    </p>
  </div>
  
  <!-- References -->
  <div class="title-references">
    <p>
      <span class="ref-label">Vide diagram S.G. No.</span> 
      <span class="ref-dots">...............</span> 
      <span class="ref-label">annexed to</span> 
      <span class="ref-dots">...............</span>
    </p>
    <p>
      <span class="ref-label">No.</span> 
      <span class="ref-dots">............................</span>
    </p>
    <p v-if="isStateLand">
      <span class="ref-label">Deed of Grant No.</span> 
      <span class="ref-dots">...............</span>
    </p>
  </div>
  
  <!-- Note -->
  <div class="title-note">
    (*Omit the inappropriate words.)
  </div>
  
  <!-- Surveyor Block -->
  <div class="title-surveyor">
    <div class="surveyor-name">{{ completeProjectInfo.surveyorName }}</div>
    <div v-if="completeProjectInfo.licenseNumber" class="surveyor-license">
      Lic. No: {{ completeProjectInfo.licenseNumber }}
    </div>
    <div v-if="completeProjectInfo.firm" class="surveyor-firm">
      {{ completeProjectInfo.firm }}
    </div>
    <div v-if="completeProjectInfo.address" class="surveyor-address">
      {{ completeProjectInfo.address }}
    </div>
    <div class="surveyor-date">
      Date: {{ formatDate(completeProjectInfo.surveyDate) }}
    </div>
  </div>
</div>
```

### **Helper Function:**

```typescript
function formatDesignation(projectInfo: any): string {
  // Examples:
  // "STANDS 1-60 WIDDICOMBE TOWNSHIP"
  // "LOTS 1-8 OF SUBDIVISION A OF LOT 1 BLOCK C OF HATFIELD"
  // "ALPHA, BETA, GAMMA" (for farms)
  
  const designation = projectInfo.designation || 'STAND NUMBER'
  const township = projectInfo.township || 'TOWNSHIP NAME'
  
  // Check if designation already includes township
  if (designation.toUpperCase().includes(township.toUpperCase())) {
    return designation.toUpperCase()
  }
  
  // Format: "STANDS [designation] [TOWNSHIP]"
  if (designation.match(/^\d+(-\d+)?$/)) {
    // Single stand or range: "1" or "1-60"
    return `STANDS ${designation} ${township.toUpperCase()}`
  } else if (designation.match(/^[A-Z]+$/)) {
    // Farm names: "ALPHA, BETA, GAMMA"
    return designation.toUpperCase()
  } else {
    // Complex designation
    return `${designation.toUpperCase()}`
  }
}
```

### **CSS Styling:**

```css
.title-block-content {
  padding: 12px;
  font-family: 'Times New Roman', serif;
  line-height: 1.5;
  color: #000;
  background: white;
}

/* Main Title */
.title-main {
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

.title-of {
  font-size: 11px;
  text-align: center;
  margin-bottom: 4px;
  font-style: italic;
}

/* Stand Designation */
.title-designation {
  font-size: 13px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 6px;
  letter-spacing: 0.3px;
}

/* Sheet Number */
.title-sheet {
  font-size: 12px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 10px;
}

/* Description Block */
.title-description {
  font-size: 9px;
  text-align: left;
  margin-bottom: 8px;
  line-height: 1.6;
}

.title-description p {
  margin: 2px 0;
}

.strike-option {
  text-decoration: none;
  position: relative;
}

/* References */
.title-references {
  font-size: 9px;
  text-align: left;
  margin-bottom: 6px;
  line-height: 1.4;
}

.title-references p {
  margin: 2px 0;
}

.ref-label {
  font-style: italic;
}

.ref-dots {
  letter-spacing: 1px;
  color: #666;
}

/* Note */
.title-note {
  font-size: 8px;
  font-style: italic;
  text-align: left;
  margin-bottom: 12px;
  color: #666;
}

/* Surveyor Block */
.title-surveyor {
  font-size: 9px;
  text-align: right;
  border-top: 1px solid #ccc;
  padding-top: 8px;
  margin-top: 8px;
}

.surveyor-name {
  font-weight: bold;
  margin-bottom: 3px;
}

.surveyor-license,
.surveyor-firm,
.surveyor-address,
.surveyor-date {
  margin-bottom: 2px;
  font-size: 8px;
}

/* Adaptive Scaling */
.title-block-content.small-sheet {
  font-size: 0.85em;
}

.title-block-content.large-sheet {
  font-size: 1.2em;
}
```

---

## 📋 Data Requirements

### **Required Fields:**

1. **designation** - Stand/lot numbers (e.g., "1-60", "565-594, 601-620")
2. **township** - Township name (e.g., "WIDDICOMBE", "SALISBURY")
3. **district** - District name (e.g., "Salisbury", "Gatooma")
4. **parcelCount** - Number of stands/lots
5. **subdivision** - Subdivision identifier (e.g., "Subdivision A")
6. **locationDetail** - Additional location info (e.g., "of Widdicombe")

### **Optional Fields:**

7. **sheetNumber** - Sheet number (if multiple sheets)
8. **hasMultipleSheets** - Boolean flag
9. **sgDiagramNumber** - Surveyor-General diagram number
10. **annexedTo** - Reference to what it's annexed to
11. **referenceNumber** - Additional reference number
12. **deedOfGrantNumber** - For State land
13. **isStateLand** - Boolean flag

### **Surveyor Information:**

14. **surveyorName** - Full name
15. **licenseNumber** - License number
16. **firm** - Firm name
17. **address** - Firm address (multi-line)
18. **surveyDate** - Survey date

---

## 🎯 Examples by Type

### **1. Township Subdivision (Single Sheet)**
```
"GENERAL PLAN"
of
STANDS 1-60 WIDDICOMBE TOWNSHIP

The figure N1, N2 ............... N1 represents
Widdicombe Township comprising 60 stands and public places
being the whole/the remainder/a portion* of Subdivision A
of Widdicombe, situate in the district of Salisbury.

Vide diagram S.G. No. ............... annexed to ...............
No. ............................
(*Omit the inappropriate words.)
```

### **2. Township Subdivision (Multiple Sheets)**
```
"GENERAL PLAN"
of
STANDS 1-20 WIDDICOMBE TOWNSHIP
SHEET 1

The figure N1, N2 ............... N1 which, together
with the figures on sheets 2 and 3, represents stands numbered 1-60 and public
places being the whole/the remainder/a portion* of Salisbury
Township Lands, situate in the district of Salisbury.

Vide diagram S.G. No. ............... annexed to ...............
No. ............................
(*Omit the inappropriate words.)
```

### **3. Municipal Council Land**
```
"GENERAL PLAN"
of
STANDS 565-594, 601-620 SALISBURY TOWNSHIP

The figure N1, N2 ............... N1 represents
50 stands and public places being portions of Salisbury Township Lands, situate in the district of Salisbury.

Vide diagram S.G. No. ............... annexed to ...............
Deed of Grant No. ...............
```

### **4. Farm Blocks**
```
"GENERAL PLAN"
of
ALPHA, BETA, GAMMA
Darwin District".
```

### **5. Subdivision of Existing Lot**
```
"GENERAL PLAN"
of
LOTS 1-8 OF SUBDIVISION A OF LOT 1 BLOCK C OF
HATFIELD

The figure N1, N2 ........... N1 represents 8 lots and
public places situate in the district of Salisbury.

Vide diagram S.G. No. ............... annexed to ...............
No. ............................
```

---

## ✅ Implementation Checklist

- [ ] Create `formatDesignation()` helper function
- [ ] Add description block generation logic
- [ ] Implement reference line formatting
- [ ] Add surveyor block with all details
- [ ] Style with proper fonts and spacing
- [ ] Make adaptive to sheet size
- [ ] Test with all project types
- [ ] Validate against SI 727 examples

---

**Last Updated:** 2025-12-14 16:00  
**Status:** 📋 Specification Complete  
**Source:** Seventh Schedule (Section 64), Zimbabwe Survey Regulations

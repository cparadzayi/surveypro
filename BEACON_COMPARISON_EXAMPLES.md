# Beacon Comparison - Output Examples

**Based on:** SI 727 Section 67(5)  
**Date:** 2025-01-21

---

## Example 1: Tabulation of Co-ordinates

### **Scenario:** Urban subdivision resurvey (3 beacons found)

```
═══════════════════════════════════════════════════════════════════════════════
                        COORDINATE COMPARISON
═══════════════════════════════════════════════════════════════════════════════

Project: Stand 123 Borrowdale, Harare
S.R. No.: 45678/2025
Surveyor: John Mataranyika (LS 456)
Date: 21 November 2025

───────────────────────────────────────────────────────────────────────────────
              SR 21/2016                    |         This Survey
───────────────────────────────────────────────────────────────────────────────
Point    Y              X           |    Y              X           dy      dx
───────────────────────────────────────────────────────────────────────────────
CP1   -82612,590   2149425,610  |  -82612,590   2149425,615   0,000  -0,005
CP2   -82624,208   2149405,760  |  -82624,208   2149405,764   0,000  -0,004
CP3   -82600,507   2149418,538  |  -82600,508   2149418,543   0,000  -0,005
───────────────────────────────────────────────────────────────────────────────

STATISTICAL SUMMARY:
  Number of beacons compared: 3
  Mean discrepancy: 0.005m
  Maximum discrepancy: 0.005m (CP1, CP3)
  RMS error: 0.005m
  
TOLERANCE ASSESSMENT:
  Survey type: Urban
  Acceptable tolerance: ±0.020m
  Beacons within tolerance: 3 of 3 (100%)
  
CONCLUSION:
  From the above comparison, I adopt the positions of all found beacons.

───────────────────────────────────────────────────────────────────────────────
Color Coding (SI 727 Section 67(5)):
  • Original data (SR 21/2016): BLACK
  • This Survey data: RED
  • Differences (dy, dx): RED
═══════════════════════════════════════════════════════════════════════════════
```

---

## Example 2: Tabulation with Larger Discrepancies

### **Scenario:** Rural farm survey (4 beacons, 1 replaced)

```
═══════════════════════════════════════════════════════════════════════════════
                        COORDINATE COMPARISON
═══════════════════════════════════════════════════════════════════════════════

Project: Farm Portion 12 of Lot 45, Marondera
S.R. No.: 12345/2025
Surveyor: Sarah Moyo (LS 789)
Date: 21 November 2025

───────────────────────────────────────────────────────────────────────────────
              SR 8765/2010                   |         This Survey
───────────────────────────────────────────────────────────────────────────────
Point    Y              X           |    Y              X           dy      dx
───────────────────────────────────────────────────────────────────────────────
BN1   18862,520   2268555,010  |  18862,528   2268555,010   0,008   0,000
BN2   10266,830   2275951,170  |  10266,975   2275951,170   0,145   0,000
BN3   25123,450   2270234,560  |  25123,598   2270234,560   0,148   0,000
BN4   15678,234   2272456,789  |  15678,234   2272456,789   0,000   0,000
───────────────────────────────────────────────────────────────────────────────

STATISTICAL SUMMARY:
  Number of beacons compared: 4
  Mean discrepancy: 0.075m
  Maximum discrepancy: 0.148m (BN3)
  RMS error: 0.103m
  Standard deviation: 0.071m
  
TOLERANCE ASSESSMENT:
  Survey type: Rural
  Acceptable tolerance: ±0.200m
  Beacons within tolerance: 4 of 4 (100%)
  
BEACON STATUS:
  BN1: Found in good condition, adopted
  BN2: Found, scattered stones, adopted
  BN3: Not found, beacon replaced 0.148m from original position
  BN4: Found in excellent condition, adopted
  
CONCLUSION:
  From the above comparison, I adopt the positions of all found beacons.
  Beacon BN3 was not found and has been replaced at calculated position.

───────────────────────────────────────────────────────────────────────────────
Color Coding (SI 727 Section 67(5)):
  • Original data (SR 8765/2010): BLACK
  • This Survey data: RED
  • Differences (dy, dx): RED
═══════════════════════════════════════════════════════════════════════════════
```

---

## Example 3: Comparison Sketch

### **Scenario:** Same as Example 1, graphical representation

```
═══════════════════════════════════════════════════════════════════════════════
                        BEACON COMPARISON SKETCH
═══════════════════════════════════════════════════════════════════════════════

Project: Stand 123 Borrowdale, Harare
S.R. No.: 45678/2025                    Original Survey: SR 21/2016
Surveyor: John Mataranyika (LS 456)     Date: 21 November 2025
Scale: 1:500

                                    N ↑
                                    │
                                    │
                                    │
         
         CP2                                              CP3
          ●────→●                                          ●──→●
        Black  Red                                       Black Red
       (2016) (2025)                                    (2016)(2025)
       Δ = 0.004m                                       Δ = 0.005m
       Bearing: 000°                                    Bearing: 000°
       
       
       
       
                        CP1
                         ●───→●
                       Black Red
                      (2016)(2025)
                      Δ = 0.005m
                      Bearing: 000°


───────────────────────────────────────────────────────────────────────────────
INTER-BEACON DISTANCE CHECK:
───────────────────────────────────────────────────────────────────────────────
Line          Original (2016)    This Survey (2025)    Difference
───────────────────────────────────────────────────────────────────────────────
CP1 - CP2        23.456m              23.456m            0.000m    ✓
CP2 - CP3        31.234m              31.235m            0.001m    ✓
CP3 - CP1        28.789m              28.789m            0.000m    ✓
───────────────────────────────────────────────────────────────────────────────

BEARING CHECK:
───────────────────────────────────────────────────────────────────────────────
Line          Original (2016)    This Survey (2025)    Difference
───────────────────────────────────────────────────────────────────────────────
CP1 → CP2        145°23'15"           145°23'15"         0°00'00"  ✓
CP2 → CP3        087°15'42"           087°15'42"         0°00'00"  ✓
CP3 → CP1        312°45'18"           312°45'18"         0°00'00"  ✓
───────────────────────────────────────────────────────────────────────────────

LEGEND:
  ● Black dot = Original position (SR 21/2016)
  ● Red dot = New survey position (This Survey)
  → Blue arrow = Displacement vector
  Δ = Displacement magnitude
  ✓ = Within acceptable tolerance

SCALE:  ├──────────┤  10 meters

CONCLUSION:
  The inter-beacon distances and bearings show excellent consistency between
  the original survey (SR 21/2016) and this survey. All discrepancies are
  within acceptable tolerance. I adopt the positions of all found beacons.

═══════════════════════════════════════════════════════════════════════════════
```

---

## Example 4: Comparison Sketch with Significant Discrepancy

### **Scenario:** One beacon shows movement

```
═══════════════════════════════════════════════════════════════════════════════
                        BEACON COMPARISON SKETCH
═══════════════════════════════════════════════════════════════════════════════

Project: Farm Portion 12 of Lot 45, Marondera
S.R. No.: 12345/2025                    Original Survey: SR 8765/2010
Scale: 1:1000

                                    N ↑
                                    │
                                    │
         
         BN2                                              BN3
          ●────────────────────→●                          ●
        Black                  Red                       Black
       (2010)                (2025)                     (2010)
       Δ = 0.145m                                       ⚠ NOT FOUND
       Bearing: 000°                                    REPLACED:
                                                        New position ●
                                                                   Red
                                                        Δ = 0.148m from original
       
                        BN1
                         ●─→●
                       Black Red
                      (2010)(2025)
                      Δ = 0.008m
                      Bearing: 000°
                      
                      
                                                         BN4
                                                          ●●
                                                        Black/Red
                                                        (overlapping)
                                                        Δ = 0.000m


───────────────────────────────────────────────────────────────────────────────
INTER-BEACON DISTANCE CHECK:
───────────────────────────────────────────────────────────────────────────────
Line          Original (2010)    This Survey (2025)    Difference
───────────────────────────────────────────────────────────────────────────────
BN1 - BN2        156.234m             156.234m           0.000m    ✓
BN2 - BN3        187.456m             187.456m           0.000m    ✓
BN3 - BN4        134.567m             134.567m           0.000m    ✓
BN4 - BN1        198.789m             198.789m           0.000m    ✓
───────────────────────────────────────────────────────────────────────────────

BEACON ASSESSMENT:
───────────────────────────────────────────────────────────────────────────────
BN1:  Found in good condition. Discrepancy 0.008m. ADOPTED.
BN2:  Found, scattered stones, no centre-mark visible. Discrepancy 0.145m.
      Within rural tolerance (±0.200m). ADOPTED.
BN3:  NOT FOUND after extensive search within 5m radius. Area recently
      cleared for development. REPLACED at calculated position using
      intersection from BN1, BN2, and BN4. Verified by RTK GPS.
BN4:  Found in excellent condition, concreted by owner. No discrepancy.
      ADOPTED.

TOLERANCE ASSESSMENT:
  Survey type: Rural
  Acceptable tolerance: ±0.200m
  All found beacons within tolerance

CONCLUSION:
  The inter-beacon distances show excellent consistency between surveys,
  confirming the reliability of the control network. I adopt the positions
  of all found beacons (BN1, BN2, BN4) and the calculated position of
  replaced beacon BN3.

═══════════════════════════════════════════════════════════════════════════════
```

---

## Example 5: Both Methods Combined

### **Scenario:** Complex urban survey requiring both tabulation and sketch

```
═══════════════════════════════════════════════════════════════════════════════
                        BEACON COMPARISON
                    (SI 727 Section 67(5))
═══════════════════════════════════════════════════════════════════════════════

Project: Stands 45-52 Avondale Extension, Harare
S.R. No.: 98765/2025
Surveyor: Michael Chikwanha (LS 234)
Date: 21 November 2025

───────────────────────────────────────────────────────────────────────────────
PART A: TABULATION OF CO-ORDINATES
───────────────────────────────────────────────────────────────────────────────

              SR 34567/2018                  |         This Survey
───────────────────────────────────────────────────────────────────────────────
Point    Y              X           |    Y              X           dy      dx
───────────────────────────────────────────────────────────────────────────────
TB1   -45123,456   2198765,432  |  -45123,456   2198765,432   0,000   0,000
TB2   -45234,567   2198654,321  |  -45234,567   2198654,325   0,000  -0,004
TB3   -45345,678   2198543,210  |  -45345,690   2198543,210   0,012   0,000
TB4   -45456,789   2198432,109  |  -45456,789   2198432,109   0,000   0,000
TB5   -45567,890   2198321,098  |  -45567,902   2198321,098   0,012   0,000
───────────────────────────────────────────────────────────────────────────────

STATISTICAL SUMMARY:
  Beacons compared: 5
  Mean discrepancy: 0.006m
  Maximum discrepancy: 0.012m (TB3, TB5)
  RMS error: 0.008m
  Tolerance: ±0.020m (urban)
  Within tolerance: 5 of 5 (100%)

───────────────────────────────────────────────────────────────────────────────
PART B: COMPARISON SKETCH
───────────────────────────────────────────────────────────────────────────────

                                    N ↑
                                    │
         TB5                        │                    TB4
          ●──→●                     │                     ●●
        Black Red                   │                   Black/Red
       Δ=0.012m                     │                   Δ=0.000m
       
       
       
         TB3                                             TB2
          ●──→●                                           ●─→●
        Black Red                                       Black Red
       Δ=0.012m                                        Δ=0.004m
       
       
                        TB1
                         ●●
                      Black/Red
                      Δ=0.000m

INTER-BEACON CHECKS:
  TB1-TB2: Distance match ✓  Bearing match ✓
  TB2-TB3: Distance match ✓  Bearing match ✓
  TB3-TB4: Distance match ✓  Bearing match ✓
  TB4-TB5: Distance match ✓  Bearing match ✓
  TB5-TB1: Distance match ✓  Bearing match ✓

Scale: ├────┤ 20m

───────────────────────────────────────────────────────────────────────────────
CONCLUSION:
───────────────────────────────────────────────────────────────────────────────

Both the tabulation and sketch methods confirm excellent consistency between
the original survey (SR 34567/2018) and this survey. All beacon discrepancies
are well within the urban tolerance of ±0.020m. The inter-beacon distance and
bearing checks show no significant differences, confirming the integrity of
the control network.

From the above comparison, I adopt the positions of all found beacons.

═══════════════════════════════════════════════════════════════════════════════
Color Coding (SI 727 Section 67(5)):
  • Original data (SR 34567/2018): BLACK
  • This Survey data: RED
  • Differences and vectors: BLUE
═══════════════════════════════════════════════════════════════════════════════
```

---

## PDF Output Preview

### **How it appears in the Calculations Document:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    CALCULATIONS PART 1                                      │
│                                                                             │
│  [... Field measurements, traverse calculations, adjustments ...]          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│                    BEACON COMPARISON                                        │
│                 (SI 727 Section 67(5))                                      │
│                                                                             │
│  [Tabulation table with black and red text as shown above]                 │
│                                                                             │
│  OR                                                                         │
│                                                                             │
│  [Comparison sketch with vectors and checks]                               │
│                                                                             │
│  OR                                                                         │
│                                                                             │
│  [Both tabulation AND sketch]                                              │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  [... Rest of calculations ...]                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Notes

### **Tabulation Output:**
- Generate HTML table with inline CSS for black/red colors
- Convert to PDF with color preservation
- Use monospace font for coordinates
- Right-align numbers
- Include statistical summary

### **Sketch Output:**
- Use HTML5 Canvas or SVG
- Black circles for original positions
- Red circles for new positions
- Blue arrows for displacement vectors
- Auto-scale based on beacon spread
- Include distance/bearing check tables
- Export to PDF as image

### **Both Methods:**
- Tabulation on page 1
- Sketch on page 2
- Shared conclusion statement

---

**Status:** Ready for implementation based on these examples

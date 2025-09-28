# SurveyPro - Zimbabwe Survey Management Platform
## Complete User Manual

### Table of Contents
1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Dashboard Overview](#dashboard-overview)
4. [Project Management](#project-management)
5. [Survey Beacons](#survey-beacons)
6. [Survey Calculations](#survey-calculations)
7. [Digital Lodgment](#digital-lodgment)
8. [Settings & Data Management](#settings--data-management)
9. [Zimbabwe Survey Compliance](#zimbabwe-survey-compliance)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### System Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- Email address for account creation

### First Time Setup
1. **Access the Application**
   - Open your web browser
   - Navigate to the application URL
   - You'll see the SurveyPro login screen with the blue MapPin logo

2. **Create Your Account**
   - Click "Don't have an account? Sign up"
   - Enter your email address (e.g., `surveyor@example.com`)
   - Create a secure password
   - Click "Sign Up"
   - You can immediately sign in with these credentials

---

## Authentication

### Signing Up (New Users)
```
📧 Email: your.email@company.com
🔒 Password: YourSecurePassword123
```

**Step-by-Step:**
1. On the login screen, click **"Don't have an account? Sign up"**
2. Enter your professional email address
3. Create a strong password (minimum 6 characters)
4. Click the **"Sign Up"** button with the UserPlus icon
5. You'll see a success message
6. Switch to **"Sign In"** mode and use your new credentials

### Signing In (Existing Users)
1. Enter your registered email address
2. Enter your password
3. Click **"Sign In"** button with the LogIn icon
4. You'll be redirected to the Dashboard

### Signing Out
- Click the **logout icon** (arrow pointing right) in the top-right corner
- You'll be returned to the login screen

---

## Dashboard Overview

The Dashboard is your command center, showing:

### Statistics Cards (Top Row)
- **Total Projects**: Number of survey projects you've created
- **Active Projects**: Projects currently in progress
- **Survey Beacons**: Total beacons across all projects
- **Calculations Today**: Calculations performed today

### Recent Projects Panel
- Shows your 5 most recent projects
- Each project displays:
  - Project name
  - District location
  - Current status (color-coded badges)

### Quick Actions Panel
- **New Project** (Blue) - Create a survey project
- **Add Beacons** (Green) - Add survey points
- **Calculate Area** (Yellow) - Perform area calculations
- **Generate Report** (Purple) - Create survey reports

### Navigation Example:
```
Dashboard → Projects → Create New Project → Add Beacons → Calculations
```

---

## Project Management

### Creating a New Survey Project

**Navigation:** `Dashboard → Projects → New Project`

#### Step 1: Basic Information
```
Project Name: "Residential Subdivision - Block A"
Project Type: [Dropdown] Cadastral
District: "Harare"
Coordinate System: [Optional] Select from dropdown
```

#### Step 2: Surveyor Information
```
Surveyor Name: "John Smith"
Registration Number: "LS001234"
Field Work Start Date: [Date Picker] 2024-01-15
Field Work End Date: [Optional] 2024-01-30
```

#### Step 3: Survey Purpose
```
Survey Purpose: "Subdivision of Stand 123 into 15 residential stands 
for development purposes in accordance with approved layout plan."
```

#### Step 4: Parent Property Information (Section 53)
```
Parent Diagram Number: "D12345"
Parent Deed Type: "Certificate of Title"
Parent Deed Number: "CT67890"
```

#### Step 5: Additional Options
- ☑️ **Based on trigonometrical system** (if applicable)
- **Notes:** Any special circumstances or requirements

**Example Complete Project:**
```
✅ Project: "Mbare Township Extension"
📍 District: "Harare"
👤 Surveyor: "Mary Chikwanha (LS002456)"
📅 Duration: 2024-02-01 to 2024-02-28
🎯 Purpose: "Township establishment for 200 residential stands"
```

### Viewing Projects
- **Grid View**: Projects displayed as cards
- **Search**: Use the search bar to find projects by name, district, or surveyor
- **Status Colors**:
  - 🔘 **Gray**: Draft
  - 🔵 **Blue**: Field Complete
  - 🟡 **Yellow**: Calculations Complete
  - 🟣 **Purple**: Diagram Submitted
  - 🟢 **Green**: Approved
  - 🟢 **Emerald**: Registered

### Project Actions
- **👁️ View**: See detailed project information
- **✏️ Edit**: Modify project details
- **🗑️ Delete**: Remove project (with confirmation)

---

## Survey Beacons

Survey beacons are the physical markers that define property boundaries according to Zimbabwe survey regulations.

### Adding Survey Beacons

**Navigation:** `Dashboard → Beacons → Select Project → Add Beacon`

#### Step 1: Select Project
```
Project Selection: [Dropdown] "Mbare Township Extension - Harare"
```

#### Step 2: Basic Information
```
Beacon Name: "P" (or Q, R, A1, etc.)
Beacon Type: [Dropdown]
  - Corner (property corners)
  - Indicatory (intermediate points)
  - Reference Mark (permanent reference)
  - Witness (backup markers)
Beacon Status: [Dropdown]
  - Placed (newly established)
  - Found (existing beacon located)
  - Replaced (old beacon replaced)
  - Missing (beacon not found)
  - Damaged (beacon found but damaged)
```

#### Step 3: Zimbabwe Coordinates
```
⚠️ Zimbabwe Convention:
   Y increases westwards
   X increases southwards

Y Coordinate (westwards): 1234567.890
X Coordinate (southwards): 2345678.123
Elevation (optional): 1456.789 m
```

#### Step 4: Physical Specifications (Section 22)
```
Beacon Specification: [Dropdown]
  - Iron rail 2m (soft/sandy ground)
  - Iron rail 1m with cairn
  - Iron rail 1m with mound and trenches
  - Rail section 1m
  - Concrete block 1m
  - Centre mark with cairn
  - Centre mark in concrete
  - Iron pipe in concrete cairn

Centre Mark Type: [Dropdown]
  - Iron peg
  - Iron pipe  
  - Drilled hole

Centre Mark Diameter: 12 mm
Centre Mark Depth: 450 mm
```

#### Step 5: Physical Features
- ☑️ **Has cairn** (750mm diameter, 750mm height)
- ☑️ **Has mound** (750mm diameter, 750mm height)  
- ☑️ **Has trenches** (2m length, 300mm depth, 300mm width)
- ☑️ **Established beacon** (legally recognized)

#### Step 6: Survey Metadata
```
Accuracy Class: [Dropdown] A, B, or C
Survey Method: "Triangulation" or "Traverse"
Surveyed Date: [Date Picker] 2024-01-20
Surveyed By: "Assistant Surveyor Name"
```

### Example Beacon Entry:
```
🎯 Beacon: P(1234567.890,2345678.123)
📍 Type: Corner Beacon
🔧 Spec: Iron rail 2m with cairn
📏 Accuracy: Class A
📅 Surveyed: 2024-01-20 by J. Mukamuri
✅ Status: Placed
```

### Viewing Beacons
- **Grid Layout**: Beacons shown as information cards
- **Search**: Find beacons by name, coordinates, or specification
- **Color-coded Status**: Visual status indicators
- **Coordinate Display**: Shows Zimbabwe Y,X format
- **Feature Tags**: Visual indicators for cairns, mounds, trenches

---

## Survey Calculations

Professional surveying calculations following Zimbabwe conventions.

### Navigation: `Dashboard → Calculations`

### 1. Bearing & Distance Calculator

**Use Case:** Calculate bearing and distance between two known points

#### Input Example:
```
🧭 Zimbabwe Convention: 0° = South, 90° = West

From Point:
  Y (westwards): 1234567.890
  X (southwards): 2345678.123

To Point:  
  Y (westwards): 1234600.450
  X (southwards): 2345700.789
```

#### Results:
```
📐 Bearing from South (Decimal): 45.1234°
📐 Bearing from South (DMS): 45° 07' 24.240"
📏 Distance: 156.789 m
```

### 2. Coordinates from Bearing/Distance

**Use Case:** Calculate coordinates of unknown point from known point

#### Input Example:
```
From Point:
  Y (westwards): 1234567.890
  X (southwards): 2345678.123

Bearing from South (DMS):
  Degrees: 45
  Minutes: 30
  Seconds: 15.500

Distance: 100.000 m
```

#### Results:
```
🎯 New Coordinates:
  Y-coordinate (westwards): 1234638.456
  X-coordinate (southwards): 2345748.789
📐 Bearing Used: 45° 30' 15.500"
```

### 3. Area Calculation

**Use Case:** Calculate property area from beacon coordinates

#### Input Example:
```
Beacon Coordinates (Y, X format):
Beacon 1: Y=1234567.890, X=2345678.123
Beacon 2: Y=1234600.000, X=2345678.123  
Beacon 3: Y=1234600.000, X=2345700.000
Beacon 4: Y=1234567.890, X=2345700.000
```

#### Results:
```
🏠 Official Area (Zimbabwe Convention):
   0.7040 ha (7,040 m²)

📊 Raw Calculation: 7040.00 m² (before rounding)

⚖️ Rounding Convention Applied:
   Area ≥ 1 ha: Displayed in hectares to 4 decimal places
   Area < 1 ha: Rounded to nearest m² using banker's rounding
```

### Calculation Tips:
- **Always use Zimbabwe coordinates** (Y=westwards, X=southwards)
- **Bearings are from South** (0° = South, 90° = West)
- **Results follow Zimbabwe rounding conventions**
- **Save important calculations** for project records

---

## Digital Lodgment

The Digital Lodgment module creates professional electronic field books compliant with Zimbabwe survey regulations.

### Navigation: `Dashboard → Digital Lodgment`

### Creating Electronic Field Books

#### Step 1: Project Selection
```
Select Project: [Dropdown] "Mbare Township Extension - Harare"
```

#### Step 2: Field Book Configuration
```
Field Book Title: "Electronic Field Book - Mbare Township"
Surveyor: "Mary Chikwanha (LS002456)"
Date Range: 2024-02-01 to 2024-02-28
Instrument: "Leica TS16 Total Station"
Weather: "Clear, light breeze"
```

#### Step 3: Trigonometric Stations
Add reference stations for calculations:
```
Station Name: "TRIG001"
Y Coordinate: 1234567.890
X Coordinate: 2345678.123
Elevation: 1456.789 m
Description: "Concrete pillar with bronze plate"
```

#### Step 4: Field Observations
Enter survey observations:
```
From Station: "TRIG001"
To Beacon: "P"
Horizontal Angle: 45° 30' 15.500"
Vertical Angle: 89° 45' 30.200"
Slope Distance: 156.789 m
Target Height: 1.500 m
```

### Field Book Structure

The electronic field book follows Zimbabwe surveying standards:

#### **Page Organization:**
- **Field Notes (E1, E2, E3...)**: Raw observations and measurements
- **Coordinate List (100+)**: Computed coordinates with calculation references
- **Calculations (C1, C2, C3...)**: Detailed bearing/distance calculations

#### **Professional Layout:**
```
📋 Field Book Contents:
   📄 Field Notes: Pages E1-E5 (observations)
   📊 Coordinate List: Pages 100-102 (with calc refs)
   🧮 Calculations: Pages C1-C8 (detailed workings)
```

### Coordinate List Features

#### **Zimbabwe Convention Format:**
```
Beacon    Y-Coordinate    X-Coordinate    Elevation    Calc Ref
P         1234567.890     2345678.123     1456.789     Calc 1, Page C1
Q         1234600.450     2345700.789     1458.234     Calc 2, Page C2
R         1234580.120     2345720.456     1459.567     Calc 3, Page C3
```

#### **Calculation References:**
- Each coordinate links to specific calculation page
- Shows method used (bearing/distance from trig station)
- Includes accuracy class and survey date

### Calculation Pages

#### **Professional Workings:**
```
CALCULATION 1 - Page C1
From: TRIG001 to Beacon P

Given:
TRIG001: Y=1234567.890, X=2345678.123
Bearing: 45° 30' 15.500" from South
Distance: 156.789 m

Calculation:
ΔY = 156.789 × sin(45° 30' 15.500") = 111.234 m
ΔX = 156.789 × cos(45° 30' 15.500") = 110.567 m

Result:
P: Y = 1234567.890 + 111.234 = 1234679.124
P: X = 2345678.123 + 110.567 = 2345788.690
```

### PDF Generation

#### **Professional Output:**
- **Complete Field Book** with all sections
- **Proper Page Numbering** following Zimbabwe conventions
- **Cross-References** between coordinate list and calculations
- **Professional Layout** matching regulatory standards
- **Digital Signatures** and certification ready

#### **Export Options:**
```
📄 Generate PDF Field Book
   ✅ Field observations included
   ✅ Coordinate list with references
   ✅ Detailed calculations shown
   ✅ Professional formatting applied
   ✅ Zimbabwe standards compliant
```

### Quality Control Features

#### **Automatic Validation:**
- **Coordinate Consistency** checks across all pages
- **Calculation Verification** ensures accuracy
- **Reference Integrity** validates all cross-references
- **Format Compliance** follows Zimbabwe regulations

#### **Professional Standards:**
- **SI 727 of 1979 Compliant** field book format
- **Proper Documentation** of all survey work
- **Audit Trail** for regulatory submission
- **Digital Certification** ready for lodgment

### Usage Tips:
- **Complete all observations** before generating coordinate list
- **Verify calculations** are performed for all beacons
- **Check cross-references** between coordinate list and calculations
- **Review PDF output** before official submission
- **Maintain backup copies** of all electronic records

### Example Workflow:
```
1. Select survey project
2. Configure field book details
3. Add trigonometric stations
4. Enter field observations
5. Generate calculations automatically
6. Review coordinate list with references
7. Export professional PDF field book
8. Submit for regulatory approval
```

---

## Settings & Data Management

### Navigation: `Dashboard → Settings`

### Account Information Panel
```
📧 Email Address: surveyor@company.com
🆔 User ID: 12345678-abcd-efgh-ijkl-123456789012
📅 Account Created: January 15, 2024
```

### Database Statistics Panel
```
📊 Your Data:
   📁 Projects: 5
   🎯 Beacons: 23  
   🧮 Calculations: 12
   📋 Diagrams: 3
```

### Data Management
- **🔄 Refresh Stats**: Update data counts
- **🗑️ Clear All Data**: Remove all survey data (with confirmation)
- **⚠️ Danger Zone**: Permanent deletion warning

### Clearing Data Process:
1. Click **"Clear All Data"** (red button)
2. **Confirmation Modal** appears showing what will be deleted
3. Review the deletion summary
4. Click **"Delete All Data"** to confirm
5. **Success message** confirms completion

---

## Zimbabwe Survey Compliance

This application follows Zimbabwe Land Survey (General) Regulations, 1979 (SI 727 of 1979).

### Key Compliance Features:

#### 1. Coordinate System (Section 11)
- **Y-axis**: Increases westwards from central meridian
- **X-axis**: Increases southwards from equator
- **Bearing Convention**: 0° = South, measured clockwise

#### 2. Beacon Specifications (Section 22)
- **Iron rails**: 2m for soft ground, 1m with cairn for hard ground
- **Centre marks**: Iron pegs, pipes, or drilled holes
- **Cairns**: 750mm diameter, 750mm height
- **Trenches**: 2m length, 300mm depth, 300mm width

#### 3. Survey Records (Part VII)
The application tracks all required survey documents:
- Field Notes
- Coordinate Lists and Calculations  
- General Plans
- Working Plans
- Survey Reports
- Dispensation Certificates
- Examination Records

#### 4. Area Display (Section 40.3)
- **< 1 hectare**: Displayed in square meters (rounded)
- **≥ 1 hectare**: Displayed in hectares to 4 decimal places
- **Banker's rounding**: Applied per Zimbabwe conventions

#### 5. Project Documentation (Section 53)
- Parent property information required
- Original title deed references
- Survey purpose documentation
- Surveyor registration tracking

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Login Problems
**Problem**: "Invalid login credentials" error
**Solutions**:
- Ensure you've created an account first (Sign Up)
- Check email and password spelling
- Try signing up with a new email if needed

#### 2. Project Creation Fails
**Problem**: Error when creating new project
**Solutions**:
- Fill in all required fields (marked with *)
- Check date format in date fields
- Ensure surveyor registration number is entered

#### 3. Beacon Coordinates Issues
**Problem**: Coordinates seem wrong or calculations fail
**Solutions**:
- Remember: Y increases westwards, X increases southwards
- Use decimal format (e.g., 1234567.890)
- Check that coordinates are reasonable for Zimbabwe

#### 4. Calculation Errors
**Problem**: Unexpected calculation results
**Solutions**:
- Verify input coordinates are in Zimbabwe format
- Check bearing convention (0° = South)
- Ensure all required fields are filled

#### 5. Data Not Saving
**Problem**: Information disappears after refresh
**Solutions**:
- Check internet connection
- Ensure you're logged in
- Try refreshing the page and logging in again

#### 6. Performance Issues
**Problem**: Application running slowly
**Solutions**:
- Clear browser cache
- Close other browser tabs
- Check internet connection speed

### Getting Help
- **User Manual**: Refer to this document
- **Zimbabwe Regulations**: Consult SI 727 of 1979
- **Technical Support**: Contact your system administrator

---

## Quick Reference

### Navigation Shortcuts
```
🏠 Dashboard: Overview and statistics
📁 Projects: Create and manage survey projects  
🎯 Beacons: Add and manage survey beacons
🧮 Calculations: Perform surveying calculations
⚙️ Settings: Account and data management
```

### Zimbabwe Coordinate System
```
📍 Y-axis: Increases westwards (←)
📍 X-axis: Increases southwards (↓)  
🧭 Bearings: 0° = South, clockwise positive
```

### Common Beacon Types
```
🔵 Corner: Property boundary corners
🟢 Indicatory: Intermediate boundary points
🟣 Reference Mark: Permanent reference points
🟡 Witness: Backup/witness markers
```

### Status Workflow
```
Draft → Field Complete → Calculations Complete → 
Diagram Submitted → Approved → Registered
```

---

*This manual covers the core functionality of SurveyPro. For advanced features or specific regulatory questions, consult the Zimbabwe Land Survey (General) Regulations, 1979.*

**Version**: 1.0  
**Last Updated**: January 2024  
**Compliance**: SI 727 of 1979
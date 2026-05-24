# SurveyPro User Manual

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
   - [Account Creation](#account-creation)
   - [Logging In](#logging-in)
   - [Dashboard Overview](#dashboard-overview)
3. [Projects](#projects)
   - [Creating a Project](#creating-a-project)
   - [Viewing Projects](#viewing-projects)
   - [Editing Projects](#editing-projects)
   - [Deleting Projects](#deleting-projects)
4. [Survey Data](#survey-data)
   - [Adding Survey Points](#adding-survey-points)
   - [Importing Data](#importing-data)
   - [Exporting Data](#exporting-data)
5. [Map View](#map-view)
   - [Navigation](#navigation)
   - [Layers](#layers)
   - [Measurements](#measurements)
6. [Computations](#computations)
   - [Area Calculation](#area-calculation)
   - [Distance Measurement](#distance-measurement)
   - [Coordinate Transformation](#coordinate-transformation)
7. [User Profile](#user-profile)
   - [Updating Information](#updating-information)
   - [Changing Password](#changing-password)
8. [Troubleshooting](#troubleshooting)
   - [Common Issues](#common-issues)
   - [Contact Support](#contact-support)

## Introduction

Welcome to SurveyPro, a comprehensive survey data management and analysis tool designed for land surveyors, engineers, and GIS professionals. This manual will guide you through all the features and functionality of the application.

## Getting Started

### Account Creation
1. Click on the "Register" link on the login page
2. Fill in your details (name, email, password)
3. Click "Create Account"
4. Check your email for a verification link
5. Click the verification link to activate your account

### Logging In
1. Go to the login page
2. Enter your email and password
3. Click "Sign In"
4. You'll be redirected to your dashboard

### Dashboard Overview
- **Projects**: View and manage your survey projects
- **Recent Activity**: See recent changes and updates
- **Quick Actions**: Create new projects or access recent files

## Projects

### Creating a Project
1. Click "New Project" in the sidebar
2. Enter project details (name, description, coordinate system)
3. Click "Create"

### Viewing Projects
- Click on "Projects" in the sidebar to see all your projects
- Use the search bar to find specific projects
- Click on a project to view its details

### Editing Projects
1. Open the project you want to edit
2. Click the "Edit" button
3. Make your changes
4. Click "Save"

### Deleting Projects
1. Go to the project you want to delete
2. Click the "Delete" button
3. Confirm the deletion

## Survey Data

### Adding Survey Points
1. Open your project
2. Go to the "Survey Points" tab
3. Click "Add Point"
4. Enter point details (ID, Northing, Easting, Elevation, Description)
5. Click "Save"

### Importing Data
1. Go to the project where you want to import data
2. Click "Import"
3. Select your data file (CSV, DXF, or LandXML)
4. Map the fields if necessary
5. Click "Import"

### Exporting Data
1. Go to the project with the data you want to export
2. Click "Export"
3. Select the export format (CSV, DXF, or LandXML)
4. Choose which data to include
5. Click "Export"

## Map View

### Navigation
- **Pan**: Click and drag the map
- **Zoom**: Use the mouse wheel or the +/- buttons
- **Rotate**: Hold right-click and drag
- **Tilt**: Hold Shift + right-click and drag up/down

### Layers
- Toggle different map layers using the layer control
- Adjust opacity using the slider
- Reorder layers by dragging them

### Measurements
1. Click the "Measure" tool
2. Choose measurement type (Distance, Area, Point)
3. Click on the map to start measuring
4. Double-click to finish

## Computations

### Inverse Computation
1. Go to the "Computations" section
2. Select "Inverse (Distance & Bearing)"
3. Enter the coordinates for Point 1 (Y Westing, X Southing)
4. Enter the coordinates for Point 2 (Y Westing, X Southing)
5. Click "Calculate" to view the distance and bearing between points
6. Results include:
   - Distance in meters
   - Bearing in decimal degrees and DMS format
   - Precision indicator (10 seconds for <6000m, 1 second for ≥6000m)

### Forward Computation
1. Go to the "Computations" section
2. Select "Forward (Coordinates)"
3. Enter the starting point coordinates (Y Westing, X Southing)
4. Enter the distance in meters
5. Enter the bearing in degrees (0° = South, clockwise)
6. Click "Calculate" to view the resulting coordinates
7. Results show the new position in Y (Westing) and X (Southing)

### Area Calculation
1. Go to the "Computations" section
2. Select "Area Calculation"
3. Click "+ Add Point" to add boundary points (minimum 3 required)
4. Enter Y (Westing) and X (Southing) for each point
5. Points are automatically labeled A, B, C, etc.
6. Click "Calculate Area" to compute the area
7. Results include:
   - Area in m² (for areas < 10,000 m², rounded to nearest m²)
   - Area in hectares (for areas ≥ 10,000 m², to 4 decimal places)
   - Perimeter in meters
8. Use "Reset" to clear all points

### Bearing Conventions
- **Direction**: 0° points South, with angles increasing clockwise
- **Precision**:
  - 10-second precision for distances < 6000m
  - 1-second precision for distances ≥ 6000m
- **Banker's Rounding**: Applied to all calculations for consistency
- **Display Formats**:
  - Decimal degrees (e.g., 123.4567°)
  - Degrees, minutes, seconds (e.g., 123° 27' 24.1")
  - Cardinal directions (e.g., S 56° 30' 00.0" W)

### Coordinate System
- Uses P(Y,X) coordinate convention:
  - **Y**: Westing (positive = west of central meridian, negative = east)
  - **X**: Southing (positive from equator, increasing southwards)
- All input and output follows this convention

## User Profile

### Updating Information
1. Click on your profile picture in the top-right corner
2. Select "Profile"
3. Click "Edit"
4. Make your changes
5. Click "Save"

### Changing Password
1. Go to your profile
2. Click "Change Password"
3. Enter your current password
4. Enter your new password
5. Confirm the new password
6. Click "Update Password"

## Advanced Features

### Batch Processing
1. Upload a CSV file with multiple points for computation
2. Select the computation type (Inverse, Forward, or Area)
3. Map the required fields in your file
4. Process all points at once
5. Download results in CSV format

### Custom Coordinate Systems
1. Define custom coordinate systems in your profile
2. Set the central meridian and false origin
3. Save frequently used systems for quick access
4. Convert between coordinate systems with one click

## Troubleshooting

### Common Issues

**I can't log in**
- Check your email and password
- Make sure Caps Lock is off
- Click "Forgot Password" if needed

**Map not loading**
- Check your internet connection
- Try refreshing the page
- Clear your browser cache

**Data not saving**
- Check your internet connection
- Make sure you have permission to edit
- Try again in a few minutes

**Incorrect bearing calculations**
- Verify the coordinate system is set correctly
- Check that points are in the correct order (Y Westing, X Southing)
- Ensure bearing is entered in decimal degrees (0-360°)

**Area calculation errors**
- Make sure you have at least 3 points defined
- Check that points form a closed polygon
- Ensure coordinates are in the correct order (clockwise or counter-clockwise)

### Contact Support
If you need further assistance, please contact our support team at support@surveypro.app or call (555) 123-4567.

---
## Appendix

### Mathematical Formulas

#### Inverse Calculation (Distance and Bearing)
```
Distance = √((Y₂-Y₁)² + (X₂-X₁)²)
Bearing = atan2(Y₂-Y₁, X₂-X₁) * (180/π) + 90
if Bearing < 0: Bearing += 360
```

#### Forward Calculation
```
Y₂ = Y₁ + (distance * sin(bearing * π/180))
X₂ = X₁ + (distance * cos(bearing * π/180))
```

#### Area Calculation (Shoelace Formula)
```
Area = ½ * |Σ(Xi * Yi+1) - Σ(Yi * Xi+1)|
```

*Last Updated: October 2025*
*SurveyPro v1.2.0*

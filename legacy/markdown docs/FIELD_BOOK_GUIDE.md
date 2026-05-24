# Field Book Feature - Quick Start Guide

## ✅ How to Access Field Book

### Option 1: From Project Detail Page
1. Go to **Projects** page (`http://localhost:5173/projects`)
2. Click on any project
3. Click on the **"Field Book"** tab
4. Click **"Open Field Book"** button

### Option 2: Direct URL
- Navigate to: `http://localhost:5173/projects/{projectId}/field-book`
- Replace `{projectId}` with your actual project ID

## 📤 Upload Field Book Data

1. **Prepare CSV File** with these columns:
   ```
   Point,Y,X,Status,Calcs Page,Description,Date of survey
   P2,97538004,2247107872,F,,50mm Iron Pipe in Concrete,1/10/2025
   ZA,96271080,2247869919,F,,50mm Iron Pipe in Concrete,1/10/2025
   ```

2. **Column Definitions**:
   - **Point**: Beacon/station name (e.g., P2, ZA, 2283A)
   - **Y**: Westing coordinate (positive = west of central meridian)
   - **X**: Southing coordinate (positive from equator southwards)
   - **Status**: 
     - `F` = Found monument (existing beacon/station)
     - `P` = Placed monument (newly set)
   - **Calcs Page**: Reference to calculation sheet (optional)
   - **Description**: Monument description
   - **Date of survey**: Survey date (MM/DD/YYYY or DD/MM/YYYY)

3. **Upload Steps**:
   - Go to "Upload Data" tab
   - Click "Select CSV File"
   - Preview first 5 rows
   - Click "Upload Data"

## 👀 View Field Data

1. Switch to **"View Data"** tab
2. See all uploaded survey points
3. Use pagination (20 entries per page)
4. Status badges:
   - 🟢 Green = Found (F)
   - 🟡 Yellow = Placed (P)

## 📄 Generate Field Book

1. Switch to **"Generate Field Book"** tab
2. Toggle "Include calculations" option
3. Click "Generate Field Book"
4. Downloads JSON file with:
   - Project details
   - Field data organized in pages (20 entries each)
   - Total entries and page count
   - Generation timestamp

## 🔧 Technical Details

### API Endpoints Available:
- `GET /field-data/project/:projectId` - Get all field data
- `POST /field-data/import` - Upload CSV file
- `POST /field-book/generate` - Generate field book
- `GET /field-data/project/:projectId/stats` - Get statistics

### Coordinate System:
- Uses P(Y,X) convention
- Y = Westing (west of central meridian is positive)
- X = Southing (south from equator is positive)
- Zimbabwe zones: Lo 25, Lo 27, Lo 29, Lo 31, Lo 33

### Sample Data:
Use the uploaded screenshot data as a template for your CSV files.

## 🎯 Next Enhancements
- PDF generation for field books
- Automatic calculation sheets
- Coordinate averaging for duplicate observations
- Area calculations for survey stands
- Export to DXF/LandXML formats

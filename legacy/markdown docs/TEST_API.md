# API Testing Guide

## Test the Field Data Endpoints

### 1. Start Backend Server
```bash
cd c:\mataranyika\SurveyPro\backend
npm run dev
```

### 2. Test Data Retrieval
```bash
# Get field data for project 1
curl http://localhost:3042/api/field-data/project/1

# Expected: Array of field data objects
# Example: [{"id":1,"project_id":1,"point":"P1","y":1234.567,"x":5678.901,...}]
```

### 3. Test Field Book Generation (JSON)
```bash
curl http://localhost:3042/api/field-data/generate-field-book/1?format=json
```

### 4. Test Field Book Generation (PDF)
```bash
curl -O -J http://localhost:3042/api/field-data/generate-field-book/1?format=pdf
```

### 5. Test Field Book Generation (GeoJSON)
```bash
curl http://localhost:3042/api/field-data/generate-field-book/1?format=geojson
```

## Common Issues

### Issue 1: Empty Data After Upload
**Symptom**: View Data tab shows headers but no rows
**Cause**: Data not properly saved or not being retrieved
**Fix**: Check that the projectId is correct and data was successfully imported

### Issue 2: Field Book Generation Fails
**Symptom**: 500 error when trying to generate field book
**Cause**: Missing data or incorrect field names
**Fix**: Ensure field_data table has records with correct columns (point, y, x, status, etc.)

### Issue 3: Downloads Not Working
**Symptom**: Button clicks but nothing downloads
**Cause**: Frontend not properly handling blob responses
**Fix**: Check browser console for errors

## Debugging Steps

1. **Check if data was uploaded**:
   ```sql
   SELECT * FROM field_data WHERE project_id = 1;
   ```

2. **Check server logs** for errors during upload or generation

3. **Open browser DevTools** > Network tab > check API responses

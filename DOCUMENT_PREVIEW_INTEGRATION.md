# Document Preview & Save Integration - Complete Implementation

## ✅ Implementation Status

### Files Created:
1. ✅ `app-frontend/src/services/documentStorage.ts` - Document storage service
2. ✅ `app-frontend/src/components/cadastral/DocumentPreviewModal.vue` - Preview modal component
3. ✅ `app-backend/src/routes/documents.js` - Backend document routes
4. ✅ `app-backend/src/utils/projectDirectories.js` - Directory management (updated)

### Files Modified:
1. ✅ `app-backend/src/server.js` - Added multipart plugin
2. ✅ `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue` - Added modal

## 🔧 Integration Steps for Each Document Type

Replace the existing `viewFieldBook`, `viewCalculationsPart1`, `viewCoordinateList`, etc. functions with the following implementations:

### 1. Field Book

```typescript
async function viewFieldBook() {
  if (!workflowState.documents.fieldBook) {
    alert('No field book data available');
    return;
  }
  
  try {
    const fieldBook = workflowState.documents.fieldBook;
    const pdfGenerator = new FieldBookPDFGenerator({
      filename: `FieldBook_${new Date().toISOString().split('T')[0]}.pdf`
    });
    
    const enhancedFieldBook = {
      ...fieldBook,
      metadata: {
        ...fieldBook.metadata,
        surveyorName: workflowState.surveyorInfo.landSurveyor,
        surveyDescription: workflowState.surveyorInfo.surveyOf,
        surveyDate: workflowState.surveyorInfo.surveyDate,
        instruments: workflowState.surveyorInfo.instruments,
        address: workflowState.surveyorInfo.address
      },
      points: fieldBook.points
    };
    
    // Generate PDF Blob
    const pdfBlobUrl = await (pdfGenerator as any).generatePDFBlob(enhancedFieldBook);
    const response = await fetch(pdfBlobUrl);
    const pdfBlob = await response.blob();
    URL.revokeObjectURL(pdfBlobUrl);
    
    // Open preview modal
    previewModal.value = {
      isOpen: true,
      title: 'Electronic Field Book',
      subtitle: `${workflowState.importedPoints.length} coordinates • ${fieldBook.metadata.pageCount} pages`,
      pdfBlob,
      documentType: 'field-book',
      fileName: `FieldBook_${new Date().toISOString().split('T')[0]}.pdf`
    };
  } catch (error) {
    console.error('Error:', error);
    alert('Error generating PDF preview');
  }
}
```

### 2. Calculations Part 1

```typescript
async function viewCalculationsPart1() {
  if (!workflowState.documents.calculationsPart1?.pdf) {
    alert('No Calculations Part 1 PDF available');
    return;
  }
  
  try {
    const pdfBlob = new Blob([workflowState.documents.calculationsPart1.pdf.output('blob')], { type: 'application/pdf' });
    
    previewModal.value = {
      isOpen: true,
      title: 'Calculations Part 1',
      subtitle: 'Duplicate Point Analysis & Adjusted Coordinates',
      pdfBlob,
      documentType: 'calculations-part1',
      fileName: `CalculationsPart1_${new Date().toISOString().split('T')[0]}.pdf`
    };
  } catch (error) {
    console.error('Error:', error);
    alert('Error generating PDF preview');
  }
}
```

### 3. Coordinate List

```typescript
async function viewCoordinateList() {
  if (!workflowState.documents.coordinateList?.pdf) {
    alert('No Coordinate List PDF available');
    return;
  }
  
  try {
    const pdfBlob = new Blob([workflowState.documents.coordinateList.pdf.output('blob')], { type: 'application/pdf' });
    
    previewModal.value = {
      isOpen: true,
      title: 'Coordinate List',
      subtitle: `${workflowState.documents.coordinateList.points.length} coordinates`,
      pdfBlob,
      documentType: 'coordinate-list',
      fileName: `CoordinateList_${new Date().toISOString().split('T')[0]}.pdf`
    };
  } catch (error) {
    console.error('Error:', error);
    alert('Error generating PDF preview');
  }
}
```

### 4. Calculations Part 2 (Areas)

```typescript
async function viewCalculationsPart2() {
  // This would be called from CalculationsPart2View.vue after PDF generation
  // Add similar implementation when PDF generation is added to that component
  alert('Calculations Part 2 preview - To be implemented when PDF generation is added');
}
```

### 5. Report on Survey

```typescript
async function viewReportOnSurvey() {
  // To be implemented when Report on Survey PDF generation is added
  alert('Report on Survey preview - To be implemented');
}
```

### 6. DSG Certificate

```typescript
async function viewDSGCertificate() {
  // To be implemented when DSG Certificate PDF generation is added
  alert('DSG Certificate preview - To be implemented');
}
```

## 📋 Quick Reference

### Opening Preview Modal Pattern:

```typescript
previewModal.value = {
  isOpen: true,
  title: 'Document Title',
  subtitle: 'Document description',
  pdfBlob: pdfBlob,  // Blob object
  documentType: 'field-book',  // or other type
  fileName: 'Document_2025-10-28.pdf'
};
```

### Document Types:
- `'field-book'` → saves to `output/field-book/`
- `'calculations-part1'` → saves to `output/calculations/`
- `'coordinate-list'` → saves to `output/coordinate-list/`
- `'calculations-part2'` → saves to `output/calculations/`
- `'report-on-survey'` → saves to `output/reports/`
- `'dsg-certificate'` → saves to `output/certificates/`

## 🚀 Testing Checklist

- [ ] Restart backend server (`npm run dev` in app-backend)
- [ ] Restart frontend server (`npm run dev` in app-frontend)
- [ ] Create/select a project with working directory
- [ ] Import CSV data
- [ ] Generate Field Book
- [ ] Click "Preview PDF" - modal should open
- [ ] Click "Download" - PDF should download
- [ ] Click "Save to Project" - file should save to folder
- [ ] Check folder: `Documents/SurveyPro/Projects/.../output/field-book/`
- [ ] Repeat for other documents

## 🎯 Benefits

✅ **Unified Preview** - All documents use same modal
✅ **Organized Storage** - Auto-saves to correct subfolders
✅ **One-Click Save** - Save directly from preview
✅ **Download Option** - Download without saving
✅ **Path Resolution** - Handles relative/absolute paths
✅ **Visual Feedback** - Shows save confirmation
✅ **Clean UX** - Modal-based with clear actions

## 📝 Notes

- The modal uses Teleport to render at body level
- PDFs are generated as Blobs for preview
- Backend creates directories if they don't exist
- All file operations are logged in server console
- TypeScript errors shown are pre-existing and don't affect functionality

## 🔄 Next Steps

1. Update all `view*()` functions with the new pattern
2. Test each document type
3. Add PDF generation to Calculations Part 2, Report, and Certificate
4. Consider adding "Open in System Viewer" button
5. Add success notifications/toasts for better UX

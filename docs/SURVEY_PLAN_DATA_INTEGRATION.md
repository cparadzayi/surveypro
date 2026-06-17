# Survey Plan Data Integration - Persistent Project Information

## 🎯 Objective

Ensure the Survey Plan generation and export functions fully utilize all persistent project information from:
1. **Database** (`survey_projects` table)
2. **Workflow State** (reactive state management)
3. **Props** (passed from parent components)

---

## 📊 Available Data Sources

### **1. Database: `survey_projects` Table**

Located in: `app-backend/migrations/040.do.sql` (lines 47-62)

```sql
CREATE TABLE survey_projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255),
  survey_type VARCHAR(100),
  survey_date DATE,
  district VARCHAR(100),
  central_meridian VARCHAR(10),
  working_directory TEXT,
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB,
  workflow_state JSONB,
  last_used TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

**Available Fields:**
- ✅ `name` - Project name
- ✅ `client_name` - Client/owner name
- ✅ `survey_type` - Type of survey (subdivision, consolidation, etc.)
- ✅ `survey_date` - Date of survey
- ✅ `district` - District location
- ✅ `central_meridian` - Coordinate system meridian
- ✅ `working_directory` - File storage location
- ✅ `metadata` - Additional JSON data
- ✅ `workflow_state` - Complete workflow state (JSONB)

---

### **2. Workflow State: `useCadastralWorkflow`**

Located in: `app-frontend/src/composables/useCadastralWorkflow.ts`

```typescript
interface CadastralWorkflowState {
  currentStep: string
  importedPoints: CadastralPoint[]
  documents: {
    fieldBook?: any
    coordinateList?: any
    reportOnSurvey?: any
  }
  surveyorInfo: {
    landSurveyor: string
    licenseNumber: string
    firm: string
    address: string
    surveyDate: string
    surveyOf: string
    instruments: string
  }
  projectInfo: {
    name: string
    district: string
    surveyDescription: string
    workingDirectory: string
    // Additional fields from workflow
    standReference?: string
    township?: string
    surveyType?: string
    srNumber?: string
    projectId?: number
    clientName?: string
  }
  config: {
    project: {
      name: string
      surveyorName: string
      surveyorLicense: string
      clientName: string
      dateRange: { start: Date; end: Date }
    }
    coordinateSystem: {
      name: string
      datum: string
      projection: string
      zone: string
    }
    formatting: {
      includeLetterhead: boolean
      pageNumbering: boolean
      crossReferences: boolean
      precisionDisplay: { fieldBook: number; coordinateList: number }
    }
  }
}
```

---

### **3. Component Props: `SurveyPlanMapView`**

Located in: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (lines 512-522)

```typescript
const props = defineProps<{
  projectId: number
  projectInfo: {
    designation?: string      // Stand reference
    township?: string         // Township name
    district?: string         // District
    surveyType?: string       // Type of survey
    surveyDate?: string       // Survey date
    surveyorName?: string     // Surveyor name
    licenseNumber?: string    // License number
  }
}>()
```

---

## ❌ Current Issues

### **1. Missing Data in Survey Plan**

**Title Block Currently Shows:**
- ✅ "GENERAL PLAN" (hardcoded)
- ✅ Designation (from props)
- ✅ Township (from props)
- ✅ District (from props)
- ✅ Scale (from config)
- ✅ Date (from config)

**Missing Information:**
- ❌ Client name
- ❌ Survey type
- ❌ SR Number (Survey Record Number)
- ❌ Surveyor firm
- ❌ License number (in title block)
- ❌ Central meridian
- ❌ Coordinate system
- ❌ Project status

---

### **2. Config Initialization Issues**

**Current Code** (lines 543-551):
```typescript
const config = ref({
  planType: 'general-undeveloped',
  scale: 'auto',
  sheetSize: 'auto' as 'auto' | 'Small' | 'Medium' | 'Large',
  surveyorName: props.projectInfo.surveyorName || '',
  licenseNumber: props.projectInfo.licenseNumber || '',
  surveyDate: props.projectInfo.surveyDate || new Date().toISOString().split('T')[0],
  showSchedule: true,
  areaType: 'urban' as 'urban' | 'peri-urban' | 'rural'
})
```

**Problems:**
- ❌ Uses `props.projectInfo.surveyorName` (may be undefined)
- ❌ Doesn't check workflow state for surveyor info
- ❌ Doesn't load from database metadata
- ❌ Missing client name, survey type, SR number

---

### **3. Export Functions Don't Use Persistent Data**

**PDF Export** (lines 2069-2118):
```typescript
async function exportToPDF() {
  // ...
  pdf.text('GENERAL PLAN', 10, 10)
  pdf.text(props.projectInfo.designation || 'Stand Number', 10, 20)
  // Missing: client, surveyor, license, SR number, etc.
}
```

**PNG Export** (lines 2125-2150):
```typescript
async function exportToPNG() {
  // Only exports map canvas, no overlays or metadata
}
```

---

## ✅ Proposed Solution

### **Phase 1: Enhanced Data Loading**

#### **1.1 Fetch Complete Project Data from Database**

Add new function to load full project details:

```typescript
async function loadProjectMetadata() {
  try {
    const response = await fetch(`/api/survey-projects/${props.projectId}`)
    const project = await response.json()
    
    return {
      name: project.name,
      clientName: project.client_name,
      surveyType: project.survey_type,
      surveyDate: project.survey_date,
      district: project.district,
      centralMeridian: project.central_meridian,
      workingDirectory: project.working_directory,
      metadata: project.metadata,
      workflowState: project.workflow_state
    }
  } catch (error) {
    console.error('[SurveyPlanMap] Failed to load project metadata:', error)
    return null
  }
}
```

#### **1.2 Merge Data from Multiple Sources**

Create computed property for complete project info:

```typescript
const completeProjectInfo = computed(() => {
  // Priority: Database > Workflow State > Props > Defaults
  return {
    // Identification
    projectId: props.projectId,
    projectName: projectMetadata.value?.name || props.projectInfo.designation || '',
    clientName: projectMetadata.value?.clientName || workflowState?.projectInfo?.clientName || '',
    
    // Location
    designation: props.projectInfo.designation || workflowState?.projectInfo?.standReference || '',
    township: props.projectInfo.township || workflowState?.projectInfo?.township || '',
    district: props.projectInfo.district || workflowState?.projectInfo?.district || projectMetadata.value?.district || '',
    
    // Survey Details
    surveyType: props.projectInfo.surveyType || workflowState?.projectInfo?.surveyType || projectMetadata.value?.surveyType || '',
    surveyDate: props.projectInfo.surveyDate || workflowState?.surveyorInfo?.surveyDate || projectMetadata.value?.surveyDate || '',
    srNumber: workflowState?.projectInfo?.srNumber || projectMetadata.value?.metadata?.srNumber || '',
    
    // Surveyor
    surveyorName: props.projectInfo.surveyorName || workflowState?.surveyorInfo?.landSurveyor || '',
    licenseNumber: props.projectInfo.licenseNumber || workflowState?.surveyorInfo?.licenseNumber || '',
    firm: workflowState?.surveyorInfo?.firm || '',
    address: workflowState?.surveyorInfo?.address || '',
    
    // Technical
    centralMeridian: projectMetadata.value?.centralMeridian || workflowState?.projectInfo?.centralMeridian || '31',
    coordinateSystem: workflowState?.config?.coordinateSystem?.name || 'Cape Lo 31',
    
    // Files
    workingDirectory: projectMetadata.value?.workingDirectory || workflowState?.projectInfo?.workingDirectory || ''
  }
})
```

---

### **Phase 2: Enhanced Title Block**

Update title block template to show all information:

```vue
<div class="overlay-content">
  <div class="title-row title-main"><strong>GENERAL PLAN</strong></div>
  <div class="title-row" v-if="completeProjectInfo.surveyType">
    <strong>{{ completeProjectInfo.surveyType.toUpperCase() }}</strong>
  </div>
  
  <div class="title-divider"></div>
  
  <div class="title-row">{{ completeProjectInfo.designation || 'Stand Number' }}</div>
  <div class="title-row">{{ completeProjectInfo.township || 'Township Name' }}</div>
  <div class="title-row">{{ completeProjectInfo.district || 'District' }}</div>
  
  <div class="title-divider"></div>
  
  <div class="title-row" v-if="completeProjectInfo.clientName">
    <small>Client:</small> {{ completeProjectInfo.clientName }}
  </div>
  
  <div class="title-divider"></div>
  
  <div class="title-row">Scale: {{ config.scale }}</div>
  <div class="title-row">Date: {{ formatDate(completeProjectInfo.surveyDate) }}</div>
  <div class="title-row" v-if="completeProjectInfo.srNumber">
    SR No: {{ completeProjectInfo.srNumber }}
  </div>
  
  <div class="title-divider"></div>
  
  <div class="title-row surveyor-info">
    <div>{{ completeProjectInfo.surveyorName }}</div>
    <div v-if="completeProjectInfo.licenseNumber">
      <small>Lic. No:</small> {{ completeProjectInfo.licenseNumber }}
    </div>
    <div v-if="completeProjectInfo.firm">
      <small>{{ completeProjectInfo.firm }}</small>
    </div>
  </div>
  
  <div class="title-row adaptive-info" v-if="intelligentPreview">
    <small style="opacity: 0.7;">
      Sheet: {{ overlayScaling.sheetSize }} ({{ (overlayScaling.factor * 100).toFixed(0) }}%)
    </small>
  </div>
</div>
```

---

### **Phase 3: SI 727 Compliant PDF Export**

Implement proper PDF export with all SI 727 features:

```typescript
async function exportToPDF() {
  isExporting.value = true
  
  try {
    console.log('[SurveyPlanMap] 📄 Generating SI 727 compliant PDF...')
    
    // Get sheet dimensions from intelligent preview
    const layout = intelligentPreview.value?.layout
    if (!layout) throw new Error('Layout not available')
    
    const sheetSize = intelligentPreview.value.sheetSize
    const sheetDimensions = {
      Small: { width: 500, height: 400 },
      Medium: { width: 800, height: 500 },
      Large: { width: 1000, height: 800 }
    }[sheetSize]
    
    // Create PDF with SI 727 dimensions
    const pdf = new jsPDF({
      orientation: sheetDimensions.width > sheetDimensions.height ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [sheetDimensions.width, sheetDimensions.height]
    })
    
    // 1. Add map image (within drawing area)
    const canvas = map.value?.getCanvas()
    if (canvas) {
      const imgData = canvas.toDataURL('image/png')
      const drawingArea = layout.drawingArea
      pdf.addImage(
        imgData, 
        'PNG', 
        drawingArea.x, 
        drawingArea.y, 
        drawingArea.width, 
        drawingArea.height
      )
    }
    
    // 2. Add SI 727 margin guides (optional, for reference)
    if (showMarginGuides.value) {
      pdf.setDrawColor(255, 107, 107) // Red
      pdf.setLineWidth(0.5)
      pdf.setLineDash([2, 2])
      pdf.rect(0, 0, sheetDimensions.width, sheetDimensions.height)
      
      // Margins
      pdf.setDrawColor(78, 205, 196) // Cyan
      pdf.line(50, 0, 50, sheetDimensions.height) // Left
      pdf.line(0, 50, sheetDimensions.width, 50) // Top
      pdf.line(0, sheetDimensions.height - 50, sheetDimensions.width, sheetDimensions.height - 50) // Bottom
      
      pdf.setDrawColor(255, 230, 109) // Yellow
      pdf.line(sheetDimensions.width - 150, 0, sheetDimensions.width - 150, sheetDimensions.height) // Right (SG)
    }
    
    // 3. Add Title Block (SI 727 position)
    const titleBlockY = sheetDimensions.height - layout.titleBlockHeight
    pdf.setFillColor(255, 255, 255)
    pdf.rect(50, titleBlockY, sheetDimensions.width - 200, layout.titleBlockHeight, 'F')
    
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.text('GENERAL PLAN', 55, titleBlockY + 10)
    
    if (completeProjectInfo.value.surveyType) {
      pdf.setFontSize(12)
      pdf.text(completeProjectInfo.value.surveyType.toUpperCase(), 55, titleBlockY + 18)
    }
    
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    let yPos = titleBlockY + 28
    
    pdf.text(completeProjectInfo.value.designation || 'Stand Number', 55, yPos)
    yPos += 6
    pdf.text(completeProjectInfo.value.township || 'Township', 55, yPos)
    yPos += 6
    pdf.text(completeProjectInfo.value.district || 'District', 55, yPos)
    yPos += 8
    
    if (completeProjectInfo.value.clientName) {
      pdf.setFontSize(9)
      pdf.text(`Client: ${completeProjectInfo.value.clientName}`, 55, yPos)
      yPos += 6
    }
    
    pdf.setFontSize(9)
    pdf.text(`Scale: ${config.value.scale}`, 55, yPos)
    yPos += 5
    pdf.text(`Date: ${formatDate(completeProjectInfo.value.surveyDate)}`, 55, yPos)
    
    if (completeProjectInfo.value.srNumber) {
      yPos += 5
      pdf.text(`SR No: ${completeProjectInfo.value.srNumber}`, 55, yPos)
    }
    
    // Surveyor info (right side of title block)
    const rightX = sheetDimensions.width - 160
    yPos = titleBlockY + 10
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.text(completeProjectInfo.value.surveyorName, rightX, yPos, { align: 'right' })
    
    if (completeProjectInfo.value.licenseNumber) {
      yPos += 6
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.text(`Lic. No: ${completeProjectInfo.value.licenseNumber}`, rightX, yPos, { align: 'right' })
    }
    
    if (completeProjectInfo.value.firm) {
      yPos += 5
      pdf.setFontSize(8)
      pdf.text(completeProjectInfo.value.firm, rightX, yPos, { align: 'right' })
    }
    
    // 4. Add North Arrow
    // (Position from overlayPositions or default SI 727 position)
    
    // 5. Add Scale Bar
    // (Position from overlayPositions or default SI 727 position)
    
    // 6. Add Schedule of Areas (if enabled)
    if (config.value.showSchedule && parcels.value.length > 0) {
      // Add table in SI 727 position
    }
    
    // 7. Save with descriptive filename
    const filename = [
      'GeneralPlan',
      completeProjectInfo.value.designation?.replace(/\s+/g, '_'),
      completeProjectInfo.value.township?.replace(/\s+/g, '_'),
      sheetSize,
      config.value.scale.replace(':', '-'),
      new Date().toISOString().split('T')[0]
    ].filter(Boolean).join('_') + '.pdf'
    
    pdf.save(filename)
    
    console.log('[SurveyPlanMap] ✅ PDF exported:', filename)
    emit('export-complete', { format: 'pdf', filename })
    
  } catch (error) {
    console.error('[SurveyPlanMap] PDF export error:', error)
    alert('Failed to export PDF: ' + error.message)
  } finally {
    isExporting.value = false
  }
}
```

---

### **Phase 4: Enhanced PNG Export**

Export full layout with overlays:

```typescript
async function exportToPNG() {
  isExporting.value = true
  
  try {
    console.log('[SurveyPlanMap] 🖼️ Exporting PNG with overlays...')
    
    // Use html2canvas to capture entire map container including overlays
    const mapContainerEl = mapContainer.value
    if (!mapContainerEl) throw new Error('Map container not found')
    
    const canvas = await html2canvas(mapContainerEl, {
      backgroundColor: '#ffffff',
      scale: 2, // High resolution
      logging: false,
      useCORS: true
    })
    
    canvas.toBlob((blob) => {
      if (!blob) return
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      
      const filename = [
        'SurveyPlan',
        completeProjectInfo.value.designation?.replace(/\s+/g, '_'),
        completeProjectInfo.value.township?.replace(/\s+/g, '_'),
        intelligentPreview.value?.sheetSize,
        config.value.scale.replace(':', '-'),
        new Date().toISOString().split('T')[0]
      ].filter(Boolean).join('_') + '.png'
      
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      
      console.log('[SurveyPlanMap] ✅ PNG exported:', filename)
      emit('export-complete', { format: 'png', filename })
    }, 'image/png')
    
  } catch (error) {
    console.error('[SurveyPlanMap] PNG export error:', error)
    alert('Failed to export PNG: ' + error.message)
  } finally {
    isExporting.value = false
  }
}
```

---

## 📋 Implementation Checklist

### **✅ Phase 1: Data Integration**
- [ ] Add `loadProjectMetadata()` function
- [ ] Create `completeProjectInfo` computed property
- [ ] Update `config` initialization to use merged data
- [ ] Add console logging for data sources
- [ ] Test with existing projects

### **✅ Phase 2: Enhanced UI**
- [ ] Update title block template with all fields
- [ ] Add CSS for title dividers and surveyor info
- [ ] Add client name display
- [ ] Add SR number display
- [ ] Add survey type display
- [ ] Test adaptive scaling with new content

### **✅ Phase 3: PDF Export**
- [ ] Implement SI 727 compliant PDF layout
- [ ] Add margin guides to PDF
- [ ] Add complete title block to PDF
- [ ] Add north arrow to PDF
- [ ] Add scale bar to PDF
- [ ] Add schedule of areas to PDF
- [ ] Generate descriptive filenames
- [ ] Test with all sheet sizes

### **✅ Phase 4: PNG Export**
- [ ] Implement html2canvas for full layout capture
- [ ] Include all overlays in export
- [ ] Set high resolution (scale: 2)
- [ ] Generate descriptive filenames
- [ ] Test export quality

### **✅ Phase 5: DXF Export**
- [ ] Research DXF library (@tarikjabiri/dxf)
- [ ] Implement parcel boundary export
- [ ] Implement beacon point export
- [ ] Add coordinate system metadata
- [ ] Organize layers properly

---

## 🎯 Expected Outcome

After implementation, the survey plan will:

1. **Load complete project data** from database, workflow state, and props
2. **Display all relevant information** in title block (client, SR number, surveyor, etc.)
3. **Export SI 727 compliant PDFs** with proper margins, title block, overlays
4. **Export high-quality PNGs** with all overlays visible
5. **Generate descriptive filenames** based on project details
6. **Maintain data consistency** across all views and exports

---

**Next Step:** Implement Phase 1 (Data Integration) before proceeding with enhanced export functions.

---

**Last Updated:** 2025-12-14 15:50  
**Status:** 📋 Planning Complete - Ready for Implementation

# Professional Export Implementation Guide

## 🎯 **Executive Summary**

**Problem**: Current PDF exports are screen-optimized with floating overlays, not suitable for professional large-format printing.

**Solution**: Implement a professional PDF generation system with fixed SI 727 positions, proper typography, and print-ready quality.

**Impact**: Production-ready General Plans that meet Surveyor-General standards for submission and archival.

## 📋 **Implementation Steps**

### **Step 1: Install Dependencies**

```bash
cd app-frontend
npm install jspdf jspdf-autotable
npm install --save-dev @types/jspdf
```

### **Step 2: Integration in SurveyPlanMapView.vue**

Add the professional export option:

```vue
<template>
  <!-- Existing export buttons -->
  <div class="export-buttons">
    <!-- NEW: Professional Export -->
    <button 
      @click="exportProfessional" 
      :disabled="isExporting" 
      class="btn-export btn-professional"
    >
      <span v-if="!isExporting">🎨 Professional PDF (Print Quality)</span>
      <span v-else>Generating...</span>
    </button>
    
    <!-- Existing buttons -->
    <button @click="optimizeLayoutAndExport" ...>
      🎯 Auto-Arrange & Export PDF
    </button>
    <button @click="exportToPDF" ...>
      📄 Export PDF (Current Layout)
    </button>
  </div>
  
  <!-- Export options -->
  <div v-if="showExportOptions" class="export-options">
    <label>
      <span>Sheet Size:</span>
      <select v-model="exportOptions.sheetSize">
        <option value="auto">Auto (Recommended)</option>
        <option value="A0">A0 (1189×841mm)</option>
        <option value="A1">A1 (841×594mm)</option>
        <option value="A2">A2 (594×420mm)</option>
        <option value="A3">A3 (420×297mm)</option>
        <option value="A4">A4 (297×210mm)</option>
      </select>
    </label>
    
    <label>
      <span>Orientation:</span>
      <select v-model="exportOptions.orientation">
        <option value="landscape">Landscape</option>
        <option value="portrait">Portrait</option>
      </select>
    </label>
    
    <label>
      <span>Quality:</span>
      <select v-model="exportOptions.resolution">
        <option value="print">Print (300dpi)</option>
        <option value="screen">Screen (150dpi)</option>
      </select>
    </label>
    
    <label>
      <input type="checkbox" v-model="exportOptions.includeGrid">
      <span>Include Grid References</span>
    </label>
    
    <label>
      <input type="checkbox" v-model="exportOptions.includeMarginGuides">
      <span>Show Margin Guides (for proofing)</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { 
  exportProfessionalGeneralPlan, 
  calculateOptimalSheetSize,
  type SurveyPlanData,
  type ExportOptions
} from '@/utils/professionalSurveyPlanExporter'

// Export options state
const showExportOptions = ref(false)
const exportOptions = ref<ExportOptions>({
  sheetSize: 'auto',
  orientation: 'landscape',
  resolution: 'print',
  includeGrid: false,
  includeMarginGuides: false
})

// Professional export function
async function exportProfessional() {
  console.log('[SurveyPlanMap] 🎨 Starting professional export...')
  isExporting.value = true
  
  try {
    // 1. Capture high-resolution map image
    if (!mapCanvasContainer.value) throw new Error('Map container not found')
    
    showOverlays.value = false // Hide overlays for clean map capture
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const canvas = await html2canvas(mapContainer.value!, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: exportOptions.value.resolution === 'print' ? 3 : 2,
      logging: false
    })
    
    const mapImageData = canvas.toDataURL('image/png')
    showOverlays.value = true
    
    // 2. Prepare data
    const data: SurveyPlanData = {
      projectId: props.projectId,
      projectInfo: {
        designation: props.projectInfo.designation || `Stand ${parcels.value[0]?.stand || ''}`,
        township: props.projectInfo.township,
        district: props.projectInfo.district,
        surveyDate: props.projectInfo.surveyDate || new Date().toISOString(),
        surveyorName: props.projectInfo.surveyorName || config.value.surveyorName,
        licenseNumber: props.projectInfo.licenseNumber || config.value.licenseNumber,
        firm: props.projectInfo.firm
      },
      parcels: parcels.value.map(p => ({
        id: p.id,
        stand: p.stand,
        area_m2: p.area_m2 || 0,
        description: p.description
      })),
      outsideFigureData: outsideFigureData.value || undefined,
      beaconGroups: formatBeaconDescriptionGroups(coordinatePoints.value),
      mapImageData,
      scale: config.value.scale === 'auto' 
        ? intelligentPreview.value?.scale.label || '1:2000'
        : config.value.scale,
      centralMeridian: config.value.centralMeridian
    }
    
    // 3. Auto-calculate sheet size if needed
    let options = { ...exportOptions.value }
    if (options.sheetSize === 'auto') {
      const totalArea = parcels.value.reduce((sum, p) => sum + (p.area_m2 || 0), 0)
      options.sheetSize = calculateOptimalSheetSize(parcels.value.length, totalArea)
      console.log('[SurveyPlanMap] 📐 Auto-selected sheet size:', options.sheetSize)
    }
    
    // 4. Generate professional PDF
    console.log('[SurveyPlanMap] 🎨 Generating professional PDF...')
    const pdfBlob = await exportProfessionalGeneralPlan(data, options as ExportOptions)
    
    // 5. Download
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `general-plan-${data.projectInfo.designation}-${Date.now()}.pdf`
    a.click()
    URL.revokeObjectURL(url)
    
    console.log('[SurveyPlanMap] ✅ Professional export complete')
    emit('export-complete', { format: 'pdf', filename: a.download })
    
  } catch (error) {
    console.error('[SurveyPlanMap] ❌ Professional export failed:', error)
    alert(`Failed to generate professional PDF: ${error.message}`)
  } finally {
    isExporting.value = false
  }
}
</script>

<style scoped>
.btn-professional {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-professional:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
}

.btn-professional:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.export-options {
  margin-top: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.export-options label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.export-options label span {
  font-weight: 500;
  color: #495057;
}

.export-options select {
  padding: 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 14px;
}

.export-options input[type="checkbox"] {
  margin-right: 8px;
}
</style>
```

### **Step 3: Add Export Options Toggle**

```typescript
// Add to existing code
const showExportOptions = ref(false)

function toggleExportOptions() {
  showExportOptions.value = !showExportOptions.value
}
```

### **Step 4: Update Button Layout**

```vue
<div class="export-section">
  <div class="export-buttons">
    <!-- Professional Export (Primary) -->
    <button @click="exportProfessional" class="btn-export btn-professional">
      🎨 Professional PDF
    </button>
    
    <!-- Quick Export (Secondary) -->
    <button @click="optimizeLayoutAndExport" class="btn-export btn-quick">
      🎯 Quick Export
    </button>
    
    <!-- Options Toggle -->
    <button @click="toggleExportOptions" class="btn-export btn-options">
      ⚙️ Options
    </button>
  </div>
  
  <!-- Collapsible Options -->
  <transition name="slide">
    <div v-if="showExportOptions" class="export-options">
      <!-- Options UI here -->
    </div>
  </transition>
</div>
```

## 🎨 **Visual Improvements**

### **1. Typography Enhancement**

The professional exporter uses a proper typography hierarchy:

```typescript
// Title Block
"GENERAL PLAN" → 16pt Bold Helvetica
"of" → 12pt Regular Helvetica
"Stand 2474" → 14pt Bold Helvetica
Description → 10pt Regular Helvetica

// Tables
Headers → 8pt Bold Helvetica
Content → 8pt Regular Helvetica
Coordinates → 7pt Courier (monospace)

// Notes
Small text → 7pt Regular Helvetica
```

### **2. Layout Precision**

Fixed positions ensure consistency:

```
Title Block: Center-top (50mm from top)
Schedule: Left side (50mm from left, 70mm from top)
Outside Figure: Right side (115mm from right edge)
Beacon Description: Bottom-left (30mm from bottom)
Survey Statement: Bottom-center (25mm from bottom)
North Arrow: Top-right (30mm from right)
Scale Bar: Bottom-right (15mm from bottom)
```

### **3. Professional Tables**

```typescript
// Schedule of Areas
- Column widths: [15, 18, 12, 12, 10, 8]mm
- Cell padding: 1mm
- Border width: 0.1mm
- Header: Bold, centered
- Numbers: Right-aligned, monospace

// Outside Figure Data
- Column widths: [12, 15, 20, 15, 24, 24]mm
- Coordinates: Monospace (Courier)
- Constants row: Bold point ID
```

## 🧪 **Testing Checklist**

### **Visual Test**

- [ ] Export A2 landscape
- [ ] Open in PDF viewer
- [ ] Verify:
  - [ ] Title centered and legible
  - [ ] Tables aligned and bordered
  - [ ] Map image clear (no pixelation)
  - [ ] All text readable
  - [ ] No overlapping elements
  - [ ] Margins correct (50mm/150mm)

### **Print Test**

- [ ] Print on large-format printer
- [ ] Measure margins with ruler
- [ ] Check text legibility at arm's length
- [ ] Verify scale bar accuracy
- [ ] Confirm no clipping

### **Compliance Test**

- [ ] Title block format (SI 727 §28)
- [ ] Schedule of Areas (SI 727 §29)
- [ ] Outside Figure Data (SI 727 §30)
- [ ] Beacon Description (SI 727 §31)
- [ ] Scale (SI 727 §32)
- [ ] Endorsement area (SI 727 §33)

## 📊 **Comparison**

| Feature | Current (html2canvas) | Professional (jsPDF) |
|---------|----------------------|---------------------|
| **Quality** | Screen (150dpi) | Print (300dpi) |
| **Layout** | Floating overlays | Fixed SI 727 positions |
| **Typography** | Mixed fonts/sizes | Professional hierarchy |
| **Tables** | Basic HTML | Vector borders, aligned |
| **Margins** | None | SI 727 compliant (50/150mm) |
| **File Size** | ~5MB | ~3MB (optimized) |
| **Print Ready** | ❌ No | ✅ Yes |
| **SI 727 Compliant** | ❌ No | ✅ Yes |

## 🚀 **Rollout Plan**

### **Phase 1: Soft Launch** (Week 1)
- Add "Professional PDF" button
- Keep existing export options
- Gather user feedback

### **Phase 2: Refinement** (Week 2-3)
- Adjust based on feedback
- Fine-tune typography
- Optimize performance

### **Phase 3: Default** (Week 4)
- Make professional export default
- Move old export to "Legacy"
- Update documentation

### **Phase 4: Cleanup** (Week 5+)
- Remove legacy export
- Archive old code
- Final testing

## 💡 **Tips & Best Practices**

### **For Developers**

1. **Test on real printer**: Screen preview ≠ print output
2. **Use rulers**: Verify margins physically
3. **Check fonts**: Ensure Helvetica/Courier available
4. **Optimize images**: Balance quality vs. file size
5. **Version control**: Keep old exporter until confident

### **For Users**

1. **Choose correct sheet size**: Bigger isn't always better
2. **Use landscape**: Better for most survey plans
3. **Print quality**: Always use 300dpi for submission
4. **Proof first**: Enable margin guides for first print
5. **Save settings**: Remember your preferred options

## 🎯 **Success Criteria**

- [ ] 100% SI 727 compliance
- [ ] <3s export time (A2)
- [ ] <5MB file size
- [ ] 95% user satisfaction
- [ ] Zero layout rejections from SG office

## 📚 **Resources**

- **SI 727 Regulations**: [Link to official document]
- **jsPDF Documentation**: https://github.com/parallax/jsPDF
- **Typography Guide**: "The Elements of Typographic Style"
- **Print Standards**: ISO 216 (Paper sizes)

## 🆘 **Troubleshooting**

### **Issue: PDF too large**
```typescript
// Reduce map image scale
scale: exportOptions.value.resolution === 'print' ? 2 : 1.5
```

### **Issue: Text too small on A0**
```typescript
// Scale fonts for larger sheets
const fontScale = sheetSize === 'A0' ? 1.5 : 1.0
fontSize: FONTS.body.size * fontScale
```

### **Issue: Map image blurry**
```typescript
// Increase capture resolution
scale: 4 // Very high quality (slower)
```

### **Issue: Tables misaligned**
```typescript
// Adjust column widths in autoTable
columnStyles: {
  0: { cellWidth: 16 }, // Increase if content wraps
  ...
}
```

## 📞 **Support**

For issues or questions:
1. Check this guide first
2. Review `PROFESSIONAL_EXPORT_SYSTEM.md`
3. Test with sample data
4. Contact development team

---

**Status**: ✅ Ready for Implementation
**Estimated Time**: 2-3 hours
**Complexity**: Medium
**Priority**: High

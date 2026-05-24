import { calculateSI727Layout } from './src/utils/si727LayoutCalculator.js'

console.log('=== SI 727 Sheet Layout Debug ===\n')

const sheets = ['Small', 'Medium', 'Large']

sheets.forEach(sheetSize => {
  const layout = calculateSI727Layout(sheetSize, 10, 2)
  
  console.log(`${sheetSize} Sheet (${layout.sheet.width}mm × ${layout.sheet.height}mm):`)
  console.log(`  Drawing Area: ${layout.drawingArea.width}mm × ${layout.drawingArea.height}mm`)
  console.log(`  At 1:1000 scale covers: ${layout.drawingArea.width}m × ${layout.drawingArea.height}m`)
  console.log(`  At 1:2500 scale covers: ${layout.drawingArea.width * 2.5}m × ${layout.drawingArea.height * 2.5}m`)
  console.log()
})

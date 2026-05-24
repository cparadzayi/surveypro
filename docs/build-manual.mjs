import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mdToPdf } from 'md-to-pdf'

const input = resolve('./USER_MANUAL_CSV_IMPORT_AND_AREAS.md')
const output = resolve('./USER_MANUAL_CSV_IMPORT_AND_AREAS.pdf')

const stylesheet = resolve('./_manual.css')

try {
  const result = await mdToPdf({ path: input }, {
    dest_path: output,
    stylesheet: [stylesheet],
    pdf_options: { format: 'A4', margin: '15mm' },
    launch_options: {
      // Let puppeteer download a compatible Chromium automatically
      product: 'chrome'
    }
  })
  if (result.content) {
    await writeFile(output, result.content)
    console.log('Manual built at', output)
  } else {
    throw new Error('No PDF content generated')
  }
} catch (err) {
  console.error('Failed to build manual PDF:', err?.message || err)
  process.exit(1)
}

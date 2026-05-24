import { mkdir, cp, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, resolve } from 'node:path'

const src = resolve('./USER_MANUAL_CSV_IMPORT_AND_AREAS.pdf')
const dest = resolve('../app-frontend/public/help/user-manual.pdf')

try {
  await access(src, fsConstants.F_OK)
} catch {
  console.error('Manual PDF not found at', src, '\nRun: npm run build:manual')
  process.exit(1)
}

await mkdir(dirname(dest), { recursive: true })
await cp(src, dest, { force: true })
console.log('Copied manual to', dest)

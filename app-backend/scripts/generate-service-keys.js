/**
 * Make the key pair SurveyPro uses to sign its requests to VunGIS (the register check).
 *
 *   node scripts/generate-service-keys.js [--out .service-key.pem]
 *
 * Writes the PRIVATE key to a file (git-ignored: .service-key*.pem) and prints only the PUBLIC key. Give the public key to VunGIS as
 * SURVEYPRO_SERVICE_PUBLIC_KEY (or a file named by SURVEYPRO_SERVICE_KEY_FILE there); point SurveyPro at the private one with
 * SURVEYPRO_SERVICE_KEY_FILE. The private key is never printed. Re-run to rotate: change both sides together.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const i = process.argv.indexOf('--out')
const out = i > 0 ? process.argv[i + 1] : '.service-key.pem'
if (fs.existsSync(out)) { console.error(`${out} already exists; refusing to overwrite a key. Remove it first if you mean to rotate.`); process.exit(1) }
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
fs.writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
console.log(`Private key written to ${out} (not shown). Public key, for VunGIS:\n`)
console.log(publicKey.export({ type: 'spki', format: 'pem' }))

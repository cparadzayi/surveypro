/**
 * Regression test for POST /documents/save error handling.
 *
 * A write failure (e.g. the target file is open in another program) must return
 * a CLASSIFIED error. Previously the classifier was called from the catch block
 * with `fileName`, a variable declared inside the try block — so on any write
 * error the catch threw `ReferenceError: fileName is not defined`, masking the
 * real cause. This test forces a write error and asserts we never regress to
 * that ReferenceError and always get a structured response.
 */

import { describe, test, expect } from '@jest/globals'
import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import os from 'os'
import documentRoutes from '../documents.js'

function buildMultipart(boundary, { fileName, fileContent, filePath }) {
  const CRLF = '\r\n'
  return (
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}` +
    `Content-Type: application/pdf${CRLF}${CRLF}` +
    `${fileContent}${CRLF}` +
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="filePath"${CRLF}${CRLF}` +
    `${filePath}${CRLF}` +
    `--${boundary}--${CRLF}`
  )
}

describe('POST /documents/save error handling', () => {
  test('a write failure returns a classified error, not "fileName is not defined"', async () => {
    const app = Fastify()
    await app.register(multipart)
    await app.register(documentRoutes)
    await app.ready()

    // Force a write error by targeting an absolute path that is an existing
    // directory (writeFileSync over a directory throws EISDIR/EPERM). This
    // exercises the catch block without needing a real file lock.
    const boundary = '----jesttestboundary' + Date.now()
    const payload = buildMultipart(boundary, {
      fileName: 'Comprehensive_Latest.pdf',
      fileContent: '%PDF-1.4 test',
      filePath: os.tmpdir(),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/documents/save',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    })

    const json = res.json()
    // The exact regression: catch used to throw ReferenceError on `fileName`.
    expect(json.message || '').not.toMatch(/fileName is not defined/)
    // We got a structured failure from the classifier, not a crash.
    expect(json.ok).toBe(false)
    expect(typeof json.code).toBe('string')
    expect(json.code.length).toBeGreaterThan(0)
    expect([409, 500]).toContain(res.statusCode)

    await app.close()
  })
})

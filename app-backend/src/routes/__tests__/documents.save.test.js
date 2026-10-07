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
import { buildApp, rejectAll } from './helpers/buildApp.js'

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
    const app = buildApp(Fastify)
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

  test('existing file without overwrite returns 409 EXISTS and does not change it', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const app = buildApp(Fastify); await app.register(multipart); await app.register(documentRoutes); await app.ready()

    const target = path.join(os.tmpdir(), `sp-exists-${Date.now()}.pdf`)
    fs.writeFileSync(target, 'ORIGINAL')

    const boundary = '----jestb' + Date.now()
    const payload = buildMultipart(boundary, { fileName: path.basename(target), fileContent: 'NEW', filePath: target })
    const res = await app.inject({ method: 'POST', url: '/documents/save',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('EXISTS')
    expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL')
    fs.unlinkSync(target)
    await app.close()
  })

  test('existing file with overwrite=true replaces it', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const app = buildApp(Fastify); await app.register(multipart); await app.register(documentRoutes); await app.ready()

    const target = path.join(os.tmpdir(), `sp-ovr-${Date.now()}.pdf`)
    fs.writeFileSync(target, 'ORIGINAL')

    const boundary = '----jestb' + Date.now()
    const CRLF = '\r\n'
    const payload =
      `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${path.basename(target)}"${CRLF}` +
      `Content-Type: application/pdf${CRLF}${CRLF}NEW${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="filePath"${CRLF}${CRLF}${target}${CRLF}` +
      `--${boundary}${CRLF}Content-Disposition: form-data; name="overwrite"${CRLF}${CRLF}true${CRLF}` +
      `--${boundary}--${CRLF}`
    const res = await app.inject({ method: 'POST', url: '/documents/save',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload })

    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
    expect(fs.readFileSync(target, 'utf8')).toBe('NEW')
    fs.unlinkSync(target)
    await app.close()
  })
})

describe('POST /documents/* requires authentication', () => {
  // Every route in documents.js writes to, lists, or opens files on the server
  // filesystem, and /documents/save-pdf shells out to LibreOffice. All of it was
  // reachable with no token at all. This is the regression guard for that.
  const ROUTES = [
    { method: 'POST', url: '/documents/save' },
    { method: 'GET', url: '/documents/list?workingDirectory=.' },
    { method: 'GET', url: '/documents/output-manifest?workingDirectory=.' },
    { method: 'POST', url: '/documents/save-pdf' },
    { method: 'POST', url: '/documents/save-zip' },
    { method: 'POST', url: '/documents/open' },
  ]

  test.each(ROUTES)('$method $url returns 401 without a token', async (route) => {
    const app = buildApp(Fastify, { authenticate: rejectAll() })
    await app.register(multipart)
    await app.register(documentRoutes)
    await app.ready()

    const res = await app.inject({ method: route.method, url: route.url, payload: {} })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  test('the guard is a real hook, not a no-op', async () => {
    // Guards against the failure mode where someone "fixes" a broken test by
    // dropping `auth` from a route: this asserts the hook is actually invoked.
    let hookRan = false
    const app = buildApp(Fastify, {
      authenticate: async (request, reply) => {
        hookRan = true
        reply.code(401).send({ error: 'Unauthorized' })
      },
    })
    await app.register(multipart)
    await app.register(documentRoutes)
    await app.ready()

    const res = await app.inject({ method: 'POST', url: '/documents/save', payload: {} })

    expect(hookRan).toBe(true)
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})

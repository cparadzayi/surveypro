import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectOutputManifest } from '../outputManifest.js';

let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-'));
  fs.mkdirSync(path.join(root, 'output', 'general-plans'), { recursive: true });
  fs.mkdirSync(path.join(root, 'output', 'calculations'), { recursive: true });
  fs.mkdirSync(path.join(root, 'input'), { recursive: true });
  fs.writeFileSync(path.join(root, 'output', 'general-plans', 'GENERAL-PLAN-Maglas.pdf'), 'x');
  fs.writeFileSync(path.join(root, 'output', 'calculations', 'Comprehensive_Latest.pdf'), 'x');
  fs.writeFileSync(path.join(root, 'input', 'beacon-receipt.jpg'), 'x');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('collects files from output/ and input/ recursively with all extensions', () => {
  const files = collectOutputManifest(root);
  const names = files.map(f => f.name).sort();
  expect(names).toEqual(['Comprehensive_Latest.pdf', 'GENERAL-PLAN-Maglas.pdf', 'beacon-receipt.jpg']);
  const gp = files.find(f => f.name === 'GENERAL-PLAN-Maglas.pdf');
  expect(gp.relDir).toBe('output/general-plans');
});

test('missing output/input folders yield an empty list, no throw', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-empty-'));
  expect(collectOutputManifest(empty)).toEqual([]);
  fs.rmSync(empty, { recursive: true, force: true });
});

test('carries each file mtime so callers can surface stale outputs', () => {
  const files = collectOutputManifest(root);
  const gp = files.find(f => f.name === 'GENERAL-PLAN-Maglas.pdf');
  expect(typeof gp.mtimeMs).toBe('number');
  expect(gp.mtimeMs).toBeGreaterThan(0);
  expect(files.every(f => typeof f.mtimeMs === 'number')).toBe(true);
});

import { attachPageCounts } from '../outputManifest.js';
import { readPdfPageCount } from '../pdfPageCount.js';
import { PDFDocument } from 'pdf-lib';

describe('attachPageCounts', () => {
  let pcRoot;

  beforeAll(async () => {
    pcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pagecount-'));
    fs.mkdirSync(path.join(pcRoot, 'output', 'general-plans'), { recursive: true });
    fs.mkdirSync(path.join(pcRoot, 'output', 'diagrams'), { recursive: true });

    // A real 3-page PDF stands in for a 3-sheet general plan.
    const gp = await PDFDocument.create();
    gp.addPage(); gp.addPage(); gp.addPage();
    fs.writeFileSync(
      path.join(pcRoot, 'output', 'general-plans', 'general-undeveloped-MAGLAS.pdf'),
      await gp.save(),
    );

    // Its DXF twin and statistics summary must never be counted.
    fs.writeFileSync(path.join(pcRoot, 'output', 'general-plans', 'general-undeveloped-MAGLAS.dxf'), 'DXF');
    const summary = await PDFDocument.create();
    summary.addPage();
    fs.writeFileSync(
      path.join(pcRoot, 'output', 'general-plans', 'general-undeveloped-MAGLAS-summary.pdf'),
      await summary.save(),
    );

    // A diagram is always one sheet by rule, so it is never opened.
    const diagram = await PDFDocument.create();
    diagram.addPage();
    fs.writeFileSync(path.join(pcRoot, 'output', 'diagrams', 'diagram-STAND_207.pdf'), await diagram.save());

    // A deliberately corrupt PDF must not break the enrichment.
    fs.writeFileSync(path.join(pcRoot, 'output', 'general-plans', 'general-broken.pdf'), 'not a pdf at all');
  });

  afterAll(() => {
    fs.rmSync(pcRoot, { recursive: true, force: true });
  });

  const by = (files, name) => files.find(f => f.name === name);

  test('reads the real page count for a general-plan PDF', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    expect(by(files, 'general-undeveloped-MAGLAS.pdf').pageCount).toBe(3);
  });

  test('never opens a diagram PDF — a diagram is one sheet by rule', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    expect(by(files, 'diagram-STAND_207.pdf').pageCount).toBeUndefined();
  });

  test('ignores the DXF twin and the statistics summary', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    expect(by(files, 'general-undeveloped-MAGLAS.dxf').pageCount).toBeUndefined();
    expect(by(files, 'general-undeveloped-MAGLAS-summary.pdf').pageCount).toBeUndefined();
  });

  test('keeps a corrupt PDF in the manifest, just without a page count', async () => {
    const files = await attachPageCounts(pcRoot, collectOutputManifest(pcRoot));
    const broken = by(files, 'general-broken.pdf');
    expect(broken).toBeDefined();
    expect(broken.pageCount).toBeUndefined();
  });

  test('returns the same array instance it was given', async () => {
    const input = collectOutputManifest(pcRoot);
    const output = await attachPageCounts(pcRoot, input);
    expect(output).toBe(input);
  });
});

describe('readPdfPageCount cache does not remember a failed read', () => {
  let retryRoot;
  let filePath;

  beforeAll(() => {
    retryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pagecount-retry-'));
    filePath = path.join(retryRoot, 'general-plan.pdf');
  });

  afterAll(() => {
    fs.rmSync(retryRoot, { recursive: true, force: true });
  });

  test('a failed read is retried, not remembered — a transient lock must not pin "unknown"', async () => {
    // Same key for BOTH calls: readPdfPageCount takes mtimeMs and size as arguments, so the
    // cache key stays identical while the bytes underneath change. That is what makes this a
    // real regression guard — if the implementation ever caches nulls again, the second call
    // returns the remembered null and this test fails.
    const FIXED_MTIME = 1_700_000_000_000;
    const FIXED_SIZE = 4242;

    fs.writeFileSync(filePath, 'not a pdf at all');
    expect(await readPdfPageCount(filePath, FIXED_MTIME, FIXED_SIZE)).toBeNull();

    const doc = await PDFDocument.create();
    doc.addPage(); doc.addPage();
    fs.writeFileSync(filePath, await doc.save());

    expect(await readPdfPageCount(filePath, FIXED_MTIME, FIXED_SIZE)).toBe(2);
  });
});

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

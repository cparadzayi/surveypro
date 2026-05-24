#!/usr/bin/env node
import 'dotenv/config'
/**
 * Simple smoke test for auth flow: register -> login -> me
 * Usage: node scripts/smoke-auth.js [email] [password]
 */
import fetch from 'node-fetch';

const resolvedPort = process.env.PORT || '3050';
const base = process.env.API_BASE || `http://localhost:${resolvedPort}/api`;
const email = process.argv[2] || `test+${Date.now()}@example.com`;
const password = process.argv[3] || 'pass123';

function log(step, obj) {
  console.log(`\n=== ${step} ===`);
  console.log(obj);
}

async function main() {
  console.log(`Using API base: ${base}`);

  // Register
  const regRes = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const regJson = await regRes.json().catch(() => ({}));
  log('REGISTER', { status: regRes.status, body: regJson });

  // Login
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  log('LOGIN', { status: loginRes.status, body: loginJson });
  if (!loginRes.ok || !loginJson.token) {
    console.error('Login failed, aborting');
    process.exit(1);
  }

  // Me
  const meRes = await fetch(`${base}/auth/me`, {
    headers: { authorization: `Bearer ${loginJson.token}` }
  });
  const meJson = await meRes.json().catch(() => ({}));
  log('ME', { status: meRes.status, body: meJson });

  // Health
  const healthRes = await fetch(`${base}/health`);
  const healthJson = await healthRes.json().catch(() => ({}));
  log('HEALTH', { status: healthRes.status, body: healthJson });

  if (meRes.ok) {
    console.log('\nAuth smoke test PASSED');
  } else {
    console.error('\nAuth smoke test FAILED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

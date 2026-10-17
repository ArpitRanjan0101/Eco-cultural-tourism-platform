// Fails when server-only configuration reaches anything a browser downloads (DECISIONS W19).
// Scans client chunks (.next/static) and prerendered HTML/RSC payloads (.next/server/app) for the value of
// INTERNAL_SERVICE_TOKEN (a canary in the Docker build stage) and for server-only variable names.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const SERVER_ONLY_NAMES = ['INTERNAL_SERVICE_TOKEN', 'BACKEND_INTERNAL_URL', 'SESSION_COOKIE_SECURE', 'BACKEND_TIMEOUT_MS'];
const token = process.env.INTERNAL_SERVICE_TOKEN;

if (!token || token.length < 32) {
  console.error('check-client-bundle: INTERNAL_SERVICE_TOKEN (canary) must be set to at least 32 characters');
  process.exit(2);
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const targets = [
  { dir: '.next/static', match: (path) => /\.(js|css|map|json|txt)$/.test(path) },
  { dir: '.next/server/app', match: (path) => /\.(html|rsc|body)$/.test(path) },
];

let scanned = 0;
const findings = [];
for (const { dir, match } of targets) {
  for await (const path of walk(dir)) {
    if (!match(path)) continue;
    scanned += 1;
    const text = await readFile(path, 'utf8');
    if (text.includes(token)) findings.push(`${path}: contains the INTERNAL_SERVICE_TOKEN value`);
    for (const name of SERVER_ONLY_NAMES) {
      if (text.includes(name)) findings.push(`${path}: mentions ${name}`);
    }
  }
}

if (scanned === 0) {
  console.error('check-client-bundle: no build output found; run `next build` first');
  process.exit(2);
}
if (findings.length > 0) {
  console.error(`check-client-bundle: ${findings.length} finding(s)\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`check-client-bundle: ${scanned} client-visible files scanned, no server-only values or names found`);

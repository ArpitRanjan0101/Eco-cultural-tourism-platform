// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/check-client-bundle.mjs', import.meta.url));
const CANARY = 'canary-0123456789abcdef0123456789abcdef';
const dirs = [];

function buildOutput(files) {
  const root = mkdtempSync(join(tmpdir(), 'bundle-'));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function check(cwd, token = CANARY) {
  return spawnSync(process.execPath, [script], { cwd, env: { PATH: process.env.PATH, INTERNAL_SERVICE_TOKEN: token }, encoding: 'utf8' });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('client bundle secret check (W19)', () => {
  it('passes clean output', () => {
    const result = check(buildOutput({ '.next/static/chunks/app.js': 'console.log("hi")', '.next/server/app/index.html': '<h1>ok</h1>' }));
    expect(result.status).toBe(0);
  });

  it('fails when the token value is in a client chunk', () => {
    const result = check(buildOutput({ '.next/static/chunks/app.js': `const t="${CANARY}"` }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains the INTERNAL_SERVICE_TOKEN value');
    expect(result.stderr).not.toContain(CANARY);
  });

  it('fails when prerendered HTML mentions a server-only variable name', () => {
    const result = check(buildOutput({ '.next/static/chunks/app.js': '', '.next/server/app/index.html': 'BACKEND_INTERNAL_URL' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('mentions BACKEND_INTERNAL_URL');
  });

  it('refuses to run without a canary or without build output', () => {
    expect(check(buildOutput({ '.next/static/a.js': '' }), 'short').status).toBe(2);
    expect(check(buildOutput({ '.next/static/a.txt.bin': '' })).status).toBe(2);
  });
});

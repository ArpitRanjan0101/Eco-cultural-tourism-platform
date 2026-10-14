'use strict';

const { scrypt, randomBytes, timingSafeEqual } = require('node:crypto');

// scrypt cost parameters (memory-hard). Stored with each hash so they can be raised later.
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 128 * 1024 * 1024;
const MAX_N = 2 ** 20;

function derive(password, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns a self-describing hash: scrypt$N$r$p$<salt b64>$<key b64>. */
async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

function parse(stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isInteger) || N > MAX_N || N < 2) return null;
  return { N, r, p, salt: Buffer.from(parts[4], 'base64'), key: Buffer.from(parts[5], 'base64') };
}

async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed || parsed.key.length !== KEY_LENGTH) return false;
  const candidate = await derive(password, parsed.salt, parsed);
  return timingSafeEqual(candidate, parsed.key);
}

function needsRehash(stored) {
  const parsed = parse(stored);
  return !parsed || parsed.N !== PARAMS.N || parsed.r !== PARAMS.r || parsed.p !== PARAMS.p;
}

let dummyHash;

/** Spends the same work as a real verification so unknown accounts are not revealed by timing. */
async function verifyAgainstDummy(password) {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
  return false;
}

module.exports = { hashPassword, verifyPassword, needsRehash, verifyAgainstDummy };

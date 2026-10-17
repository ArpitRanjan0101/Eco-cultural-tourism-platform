import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Keeps a well-formed caller request id (correlation across nginx, BFF, API), otherwise creates one. */
export function resolveRequestId(headers) {
  const incoming = headers.get('x-request-id');
  return incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Browser IP for backend rate limits and lockouts (W8). Next.js appends the socket peer to X-Forwarded-For, so
 * with `hops` trusted forwarders the client is the entry `hops` from the right (1 = direct connection in
 * development; 2 = behind one edge proxy). Anything malformed yields null and the header is not sent.
 */
export function resolveClientIp(headers, hops) {
  if (!hops) return null;
  const entries = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = entries[entries.length - hops];
  if (!candidate) return null;
  const unwrapped = candidate.startsWith('::ffff:') && isIP(candidate.slice(7)) === 4 ? candidate.slice(7) : candidate;
  return isIP(unwrapped) ? unwrapped : null;
}

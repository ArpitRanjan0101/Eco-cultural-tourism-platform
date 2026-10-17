/**
 * A post-login destination taken from the URL must be a same-site path. Anything else (absolute or
 * protocol-relative URLs, backslashes, control characters) falls back, preventing open redirects.
 */
export function safeNextPath(value, fallback = '/account') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  if (/^\/(login|register)(\/|\?|$)/.test(value)) return fallback;
  return value;
}

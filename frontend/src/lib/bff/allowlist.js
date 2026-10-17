import { FORWARDED_OPERATIONS } from './allowlist.generated';

const escape = (text) => text.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

// `{param}` matches exactly one non-empty path segment.
const COMPILED = FORWARDED_OPERATIONS.map(([method, template]) => ({
  method,
  template,
  pattern: new RegExp(`^${template.split(/\{[^}]+\}/).map(escape).join('[^/]+')}$`),
}));

/** The contract operation for a concrete method + path, or null when it is not forwardable (W5). */
export function matchOperation(method, path) {
  return COMPILED.find((operation) => operation.method === method && operation.pattern.test(path)) ?? null;
}

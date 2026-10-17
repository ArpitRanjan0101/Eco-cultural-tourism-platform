/** Joins truthy class names. Later classes do not override earlier ones; components avoid conflicting utilities. */
export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

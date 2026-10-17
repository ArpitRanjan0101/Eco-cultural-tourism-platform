// Money arrives as decimal strings (backend NUMERIC → "2500.00", W12). Intl formats the string directly,
// so no float arithmetic ever touches an amount.
const formatters = new Map();

function formatter(currency) {
  if (!formatters.has(currency)) {
    formatters.set(currency, new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }));
  }
  return formatters.get(currency);
}

/** "2500.00", "INR" → "₹2,500". Returns null for missing or malformed amounts (callers show their own text). */
export function formatMoney(amount, currency = 'INR') {
  if (typeof amount !== 'string' || !/^-?\d+(\.\d{1,2})?$/.test(amount)) return null;
  return formatter(currency).format(amount);
}

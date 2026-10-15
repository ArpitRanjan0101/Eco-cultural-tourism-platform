'use strict';

/**
 * Decimal-safe money arithmetic on NUMERIC(12,2) strings using integer paise.
 * (12,2) amounts stay far below Number.MAX_SAFE_INTEGER in minor units.
 */
function toMinor(amount) {
  const [whole, fraction = ''] = String(amount).split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)));
}

function fromMinor(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const sum = (amounts) => fromMinor(amounts.reduce((total, amount) => total + toMinor(amount), 0));
const multiply = (amount, quantity) => fromMinor(toMinor(amount) * quantity);

module.exports = { toMinor, fromMinor, sum, multiply };

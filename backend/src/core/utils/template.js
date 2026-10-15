'use strict';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/** Replaces {{name}} placeholders; unknown names render empty. Values are never interpreted as markup. */
function render(template, vars) {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g, (_, name) => (vars[name] === undefined || vars[name] === null ? '' : String(vars[name])));
}

/** Plain-text body -> minimal, fully escaped HTML email (links are made clickable). */
function textToHtml(text) {
  const paragraphs = text.split(/\n{2,}/).map((block) =>
    escapeHtml(block)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/\n/g, '<br>'),
  );
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">${paragraphs
    .map((p) => `<p>${p}</p>`)
    .join('')}<p style="color:#6b7280;font-size:12px">Jharkhand Eco &amp; Cultural Tourism</p></body></html>`;
}

module.exports = { render, textToHtml, escapeHtml };

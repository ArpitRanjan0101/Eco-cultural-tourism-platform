'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const routes = require('../../src/modules');
const { buildPostmanCollection, buildPostmanEnvironment } = require('../../src/docs/postman');

const collection = buildPostmanCollection();
const items = [];
(function walk(list, folder) {
  for (const entry of list) {
    if (entry.item) walk(entry.item, entry.name);
    else items.push({ ...entry, folder });
  }
})(collection.item);

const ROUTE_KEY = (item) => {
  const path = '/' + item.request.url.path.join('/');
  return `${item.request.method} ${path}`;
};
// Reference items use ":param" segments, scenario items use "{{variable}}" segments.
const routeFor = (item) => {
  const path = '/' + item.request.url.path.join('/');
  return routes.find((r) => {
    if (r.method.toUpperCase() !== item.request.method) return false;
    const pattern = new RegExp(`^${r.path.replace(/:[A-Za-z]+/g, '(?::[A-Za-z]+|\\{\\{[A-Za-z]+\\}\\})')}$`);
    return pattern.test(path);
  });
};

/** Replaces {{variables}} the way a prepared environment would (ids, dates, tokens). */
function fill(text) {
  const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  return text.replace(/\{\{(\$?[A-Za-z0-9]+)\}\}/g, (_, name) => {
    if (name === '$timestamp') return String(Date.now());
    if (name === '$guid') return '3f2b8c1e-8d4a-4c55-9a51-6f0e2a9d7b10';
    const days = /^dateIn(\d+)Days$/.exec(name);
    if (days) return day(Number(days[1]));
    if (name === 'dateTimeIn6Days') return new Date(Date.now() + 6 * 864e5).toISOString();
    if (name === 'dateTimeIn6DaysPlus2h') return new Date(Date.now() + 6 * 864e5 + 2 * 36e5).toISOString();
    if (name === 'providerOrderId') return 'order_Q1w2E3r4T5y6U7';
    if (name === 'refreshToken') return 'r'.repeat(43);
    if (/Id$/.test(name)) return '0b3c6f2e-6a51-4d8e-9f4b-2c7a1e5d9b30';
    if (/Email$/.test(name)) return `${name.toLowerCase()}@example.com`;
    if (/password/i.test(name)) return 'Jharkhand-2026!';
    if (name === 'menuCode') return 'main';
    return `sample-${name.toLowerCase()}`;
  });
}

describe('generated Postman collection', () => {
  it('covers every route plus the health checks', () => {
    const keys = new Set(items.map(ROUTE_KEY));
    for (const route of routes) assert.ok(keys.has(`${route.method.toUpperCase()} ${route.path}`), `missing ${route.method} ${route.path}`);
    assert.ok(items.some((i) => i.request.url.raw.endsWith('/health/ready')));
  });

  it('has example bodies that pass each route\'s own validation', () => {
    const invalid = [];
    for (const item of items) {
      const route = routeFor(item);
      if (!route?.request?.body || !item.request.body) continue;
      if (route.auth === 'webhook') continue; // provider payload, validated by signature not schema
      const result = route.request.body.safeParse(JSON.parse(fill(item.request.body.raw)));
      if (!result.success) invalid.push(`${ROUTE_KEY(item)}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
    assert.deepEqual(invalid, []);
  });

  it('shows a success and an error JSON example for every route, matching the response schema', () => {
    const problems = [];
    for (const route of routes) {
      const item = items.find((i) => i.folder !== '00 · Start here' && i.response && routeFor(i) === route);
      if (!item) {
        problems.push(`${route.method} ${route.path}: no saved examples`);
        continue;
      }
      const [success, failure] = item.response;
      if (route.response.status === 204) {
        if (success.body !== '') problems.push(`${route.method} ${route.path}: 204 example has a body`);
      } else {
        const result = route.response.schema.safeParse(JSON.parse(success.body));
        if (!result.success) problems.push(`${route.method} ${route.path}: ${result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
      }
      const error = JSON.parse(failure.body);
      if (error.success !== false || !error.error?.code) problems.push(`${route.method} ${route.path}: error example is not the error envelope`);
    }
    assert.deepEqual(problems, []);
  });

  it('targets only real routes from the scenarios', () => {
    const scenario = items.filter((i) => i.request.url.host[0] === '{{baseUrl}}' && JSON.stringify(i.request.url.path).includes('{{'));
    assert.ok(scenario.length > 10, 'scenario steps present');
    for (const item of items.filter((i) => i.request.url.host[0] === '{{baseUrl}}')) assert.ok(routeFor(item), `no route for ${ROUTE_KEY(item)}`);
  });

  it('binds every path variable and declares every variable it uses', () => {
    const declared = new Set([...collection.variable.map((v) => v.key), ...buildPostmanEnvironment().values.map((v) => v.key)]);
    const unbound = [];
    for (const item of items) {
      for (const v of item.request.url.variable ?? []) if (!v.value) unbound.push(`${ROUTE_KEY(item)} :${v.key}`);
      const used = JSON.stringify([item.request.url, item.request.body ?? null, item.request.header]);
      for (const [, name] of used.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)) {
        if (!declared.has(name) && !/^date(Time)?In/.test(name)) unbound.push(`${ROUTE_KEY(item)} {{${name}}}`);
      }
    }
    assert.deepEqual(unbound, []);
  });

  it('keeps secrets out of the generated files', () => {
    const text = JSON.stringify([collection, buildPostmanEnvironment()]);
    for (const secret of [process.env.INTERNAL_SERVICE_TOKEN, process.env.JWT_ACCESS_SECRET, process.env.PAYMENT_KEY_SECRET].filter(Boolean)) {
      assert.ok(!text.includes(secret), 'a secret value leaked into the collection');
    }
  });
});

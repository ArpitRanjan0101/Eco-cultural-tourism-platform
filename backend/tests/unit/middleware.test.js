'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createServiceTokenGuard } = require('../../src/core/middleware/serviceToken');
const validate = require('../../src/core/middleware/validate');
const { z } = require('../../src/core/validation/zod');

const fakeReq = (headers = {}, parts = {}) => ({
  get: (name) => headers[name.toLowerCase()],
  ...parts,
});

const run = (middleware, req) =>
  new Promise((resolve) => {
    middleware(req, {}, (err) => resolve(err));
  });

describe('service token guard', () => {
  const guard = createServiceTokenGuard(['current-token-'.padEnd(40, 'x'), 'previous-token-'.padEnd(40, 'y')]);

  it('rejects a missing token', async () => {
    const err = await run(guard, fakeReq());
    assert.equal(err.status, 401);
    assert.equal(err.code, 'SERVICE_TOKEN_MISSING');
  });

  it('rejects a wrong token, including a prefix of a valid one', async () => {
    for (const token of ['nope', 'current-token-']) {
      const err = await run(guard, fakeReq({ 'x-internal-service-token': token }));
      assert.equal(err.code, 'SERVICE_TOKEN_INVALID');
    }
  });

  it('accepts current and previous tokens', async () => {
    for (const token of ['current-token-'.padEnd(40, 'x'), 'previous-token-'.padEnd(40, 'y')]) {
      assert.equal(await run(guard, fakeReq({ 'x-internal-service-token': token })), undefined);
    }
  });
});

describe('validate middleware', () => {
  const middleware = validate({
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
    body: z.object({ name: z.string().min(1) }).strict(),
  });

  it('exposes parsed values on req.valid', async () => {
    const req = fakeReq({}, { params: { id: '6f1c2c1e-3b0a-4f53-9a43-6b3f2d1b9c11' }, query: { page: '3' }, body: { name: 'Ranchi' } });
    assert.equal(await run(middleware, req), undefined);
    assert.equal(req.valid.query.page, 3);
    assert.equal(req.valid.body.name, 'Ranchi');
  });

  it('collects issues from every request part as a 422', async () => {
    const req = fakeReq({}, { params: { id: 'x' }, query: { page: '0' }, body: { name: '', extra: true } });
    const err = await run(middleware, req);
    assert.equal(err.status, 422);
    const locations = new Set(err.details.map((issue) => issue.location));
    assert.deepEqual([...locations].sort(), ['body', 'params', 'query']);
  });
});

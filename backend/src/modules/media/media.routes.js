'use strict';

const { successEnvelope } = require('../../core/validation/common');
const controller = require('./media.controller');
const schema = require('./media.schema');

const TAGS = ['Media'];

const routes = [
  {
    method: 'post',
    path: '/media/upload-init',
    tags: TAGS,
    summary: 'Authorize signed media upload',
    description:
      'Reserves an asset and returns a presigned PUT URL (10 min). Content-Type and Content-Length are signed. ' +
      'Purpose decides visibility, accepted types and size: avatar (any user), content_image (CMS/destination editors), ' +
      'supply_image (partners), verification_document (private).',
    auth: 'user',
    permissions: ['media.upload'],
    rateLimit: { name: 'media_upload_init', windowSeconds: 600, max: 30, by: 'user' },
    request: { body: schema.uploadInitBody },
    response: { status: 201, schema: successEnvelope(schema.uploadInitResponse) },
    handler: controller.uploadInit,
  },
  {
    method: 'post',
    path: '/media/upload-complete',
    tags: TAGS,
    summary: 'Verify/register object metadata',
    description: 'Checks the stored object size and real file signature; invalid uploads are rejected (422 UPLOAD_INVALID) and removed.',
    auth: 'user',
    permissions: ['media.upload'],
    request: { body: schema.uploadCompleteBody },
    response: { status: 200, schema: successEnvelope(schema.mediaSchema) },
    errors: [404, 409],
    handler: controller.uploadComplete,
  },
  {
    method: 'get',
    path: '/media/:id',
    tags: TAGS,
    summary: 'Read metadata or signed file URL',
    description: 'Private assets are visible only to the uploader or media managers (others get 404).',
    auth: 'user',
    request: { params: schema.idParams },
    response: { status: 200, schema: successEnvelope(schema.mediaSchema) },
    errors: [404],
    handler: controller.getMedia,
  },
  {
    method: 'delete',
    path: '/media/:id',
    tags: TAGS,
    summary: 'Delete unreferenced allowed media',
    description: 'Uploader or media manager only. 409 MEDIA_IN_USE while referenced.',
    auth: 'user',
    request: { params: schema.idParams },
    response: { status: 204, description: 'Deleted' },
    errors: [404, 409],
    handler: controller.deleteMedia,
  },
];

module.exports = routes;

'use strict';

// Creates the public/private media buckets if missing: `npm run storage:init`.
const { ensureBuckets } = require('../config/storage');

ensureBuckets()
  .then((created) => {
    process.stdout.write(created.length ? `Created bucket(s): ${created.join(', ')}\n` : 'Buckets already exist.\n');
  })
  .catch((err) => {
    process.stderr.write(`Storage initialisation failed: ${err.message}\n`);
    process.exitCode = 1;
  });

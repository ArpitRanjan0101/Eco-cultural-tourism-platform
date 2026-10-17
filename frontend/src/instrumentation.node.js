import { getServerEnv, ServerEnvError } from './config/env.server.js';

// W19: refuse to serve with invalid server configuration.
try {
  getServerEnv();
} catch (error) {
  if (!(error instanceof ServerEnvError)) throw error;
  console.error(error.message);
  process.exit(1);
}

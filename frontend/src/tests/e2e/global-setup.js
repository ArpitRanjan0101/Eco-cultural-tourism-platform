// Compiles the routes under test once before any test runs, so first-request compile time in the dev server
// does not count against individual test timeouts. Fails fast if the server never answers.
const ROUTES = ['/api/health', '/', '/this-page-does-not-exist'];

export default async function globalSetup(config) {
  const baseURL = config.projects[0].use.baseURL;
  for (const route of ROUTES) {
    const response = await fetch(new URL(route, baseURL), { signal: AbortSignal.timeout(120_000) });
    if (response.status >= 500) throw new Error(`warm-up ${route} answered ${response.status}`);
  }
}

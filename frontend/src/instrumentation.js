// Runs once when the server starts. Node-only work lives in a separate module so the Edge bundle never sees it.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node.js');
  }
}

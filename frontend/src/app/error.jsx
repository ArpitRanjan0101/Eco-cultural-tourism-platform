'use client';

// Route-level error boundary. Shows Next's error digest as a support reference; never the error message,
// which may contain server details.
export default function ErrorBoundary({ error, reset }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6 py-16" role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted">The page could not be displayed. Please try again.</p>
      {error?.digest ? <p className="text-sm text-muted">Reference: {error.digest}</p> : null}
      <div>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-focus px-4 py-2 font-medium text-white hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

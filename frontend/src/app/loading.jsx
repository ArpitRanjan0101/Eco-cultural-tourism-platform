export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[50vh] items-center justify-center px-6">
      <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

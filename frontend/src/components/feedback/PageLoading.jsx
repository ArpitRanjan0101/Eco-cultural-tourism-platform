import Spinner from '@/components/ui/Spinner';

/**
 * Page-area loading fallback for <Suspense>. Use it around slow parts of a page, not as a route-level
 * loading.jsx above pages that may call notFound(): streaming would lock the response status at 200 (W29).
 * @param {{ label?: string }} props
 */
export default function PageLoading({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 text-muted">
      <Spinner size="md" label={label} />
    </div>
  );
}

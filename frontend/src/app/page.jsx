import { site } from '@/config/site';

// Phase 1 placeholder. The CMS-driven homepage replaces it in Phase 4 (SITEMAP.md).
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{site.name}</h1>
      <p className="text-lg text-muted">{site.description}</p>
      <p className="text-sm text-muted">The website is being built. Destinations, stays and bookings will appear here.</p>
    </main>
  );
}

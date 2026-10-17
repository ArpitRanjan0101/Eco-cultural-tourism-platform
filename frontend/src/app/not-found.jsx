import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted">The page you are looking for does not exist or has moved.</p>
      <p>
        <Link href="/" className="font-medium text-focus underline underline-offset-4">
          Go to the homepage
        </Link>
      </p>
    </main>
  );
}

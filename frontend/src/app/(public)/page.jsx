import { getHomepage } from '@/cms/adapters/cms.adapter';
import { site } from '@/config/site';
import { HomeFallback, HomePage } from '@/features/home';

export async function generateMetadata() {
  const page = await getHomepage();
  const description = page?.seo.description ?? site.description;
  return {
    title: { absolute: site.name },
    description,
    openGraph: { title: site.name, description, type: 'website', locale: 'en_IN', siteName: site.name },
  };
}

// The homepage is composed entirely from the published CMS homepage (GET /content/homepage).
export default async function Home() {
  const page = await getHomepage();
  if (!page) return <HomeFallback siteName={site.name} description={site.description} links={site.fallbackNav} />;
  return <HomePage page={page} siteName={site.name} />;
}

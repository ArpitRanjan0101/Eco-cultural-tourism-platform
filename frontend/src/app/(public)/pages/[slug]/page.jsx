import { notFound } from 'next/navigation';
import { getPublishedPage } from '@/cms/adapters/cms.adapter';
import DynamicPageRenderer from '@/cms/DynamicPageRenderer';

export async function generateMetadata({ params }) {
  const page = await getPublishedPage((await params).slug);
  if (!page) return {};
  return {
    title: page.seo.title,
    description: page.seo.description ?? undefined,
    openGraph: { title: page.seo.title, description: page.seo.description ?? undefined, type: 'article' },
  };
}

// Published CMS landing and static pages (GET /content/pages/:slug). Drafts and archived pages are 404.
export default async function CmsPage({ params }) {
  const page = await getPublishedPage((await params).slug);
  if (!page) notFound();
  return <DynamicPageRenderer page={page} />;
}

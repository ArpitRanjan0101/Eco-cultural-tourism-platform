import Container from '@/components/layout/Container';
import PageHeader from '@/components/layout/PageHeader';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';
import SectionRenderer from './SectionRenderer';

/**
 * A published CMS page (landing or static): title as the page h1, then its sections.
 * @param {{ page: { title: string, seo: { description: string|null }, sections: Array<object> } }} props
 */
export default function DynamicPageRenderer({ page }) {
  return (
    <>
      <Container>
        <PageHeader
          title={page.title}
          description={page.seo.description ?? undefined}
          breadcrumbs={<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: page.title }]} />}
        />
      </Container>
      <SectionRenderer sections={page.sections} />
    </>
  );
}

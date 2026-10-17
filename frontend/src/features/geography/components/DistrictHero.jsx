import PageHeader from '@/components/layout/PageHeader';
import Breadcrumbs from '@/components/navigation/Breadcrumbs';

/**
 * District detail heading (the page h1) with breadcrumbs back to the directory and region.
 * @param {{ district: { name: string, description?: string|null, region: { name: string, slug: string } } }} props
 */
export default function DistrictHero({ district }) {
  return (
    <PageHeader
      eyebrow={`${district.region.name} region`}
      title={district.name}
      description={district.description ?? undefined}
      breadcrumbs={
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/' },
            { label: 'Districts', href: '/districts' },
            { label: district.region.name, href: `/districts?region=${district.region.slug}` },
            { label: district.name },
          ]}
        />
      }
    />
  );
}

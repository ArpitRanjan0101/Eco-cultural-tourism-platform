import Breadcrumbs from '@/components/navigation/Breadcrumbs';

/** Home › Destinations › District › Destination (district step only when the API provides one). */
export default function DestinationBreadcrumbs({ destination }) {
  return (
    <Breadcrumbs
      items={[
        { label: 'Home', href: '/' },
        { label: 'Destinations', href: '/destinations' },
        ...(destination.district ? [{ label: destination.district.name, href: `/districts/${destination.district.slug}` }] : []),
        { label: destination.name },
      ]}
    />
  );
}

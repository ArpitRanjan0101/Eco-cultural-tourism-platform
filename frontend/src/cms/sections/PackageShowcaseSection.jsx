import { PackageCard } from '@/features/packages';
import CardSection from './CardSection';

/** `package_showcase`: published tour packages with their next departure. */
export default function PackageShowcaseSection({ heading, packages, sectionId }) {
  return (
    <CardSection
      sectionId={sectionId}
      heading={heading}
      items={packages}
      renderItem={(pkg) => <PackageCard pkg={pkg} />}
      viewAll={{ href: '/packages', label: 'View all packages' }}
    />
  );
}

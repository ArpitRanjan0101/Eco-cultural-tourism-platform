import ImageGallery from '@/components/data-display/ImageGallery';
import Section from '@/components/layout/Section';

/** Destination photos (API gallery, in editor order); renders nothing without images. */
export default function DestinationGallery({ gallery, name }) {
  if (!gallery?.length) return null;
  return (
    <Section id="gallery" title="Photos" spacing="sm">
      <ImageGallery images={gallery} title={`${name} photos`} columns={3} />
    </Section>
  );
}

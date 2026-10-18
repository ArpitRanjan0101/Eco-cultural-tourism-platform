import Section from '@/components/layout/Section';
import ImageGallery from './ImageGallery';

/**
 * "Photos" section for an API gallery (editor order, lightbox); renders nothing without images.
 * @param {{ gallery?: Array<object>|null, name: string }} props
 */
export default function GallerySection({ gallery, name }) {
  if (!gallery?.length) return null;
  return (
    <Section id="gallery" title="Photos" spacing="sm">
      <ImageGallery images={gallery} title={`${name} photos`} columns={3} />
    </Section>
  );
}

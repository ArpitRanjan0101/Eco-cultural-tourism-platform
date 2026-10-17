import ImageGallery from '@/components/data-display/ImageGallery';
import Section from '@/components/layout/Section';

/** `image_gallery`: public CMS images with captions, opening in the shared lightbox. */
export default function ImageGallerySection({ heading, items, sectionId }) {
  if (!items.length) return null;
  const title = heading ?? 'Gallery';
  const images = items.map((item) => ({ ...item.image, altText: item.image.altText ?? item.caption ?? null }));
  return (
    <Section id={sectionId} title={heading ?? undefined}>
      <ImageGallery images={images} title={title} columns={3} />
    </Section>
  );
}

import { SECTION_SCHEMAS } from './sectionSchemas';
import CategoryGridSection from './sections/CategoryGridSection';
import CTABannerSection from './sections/CTABannerSection';
import CulturalHighlightsSection from './sections/CulturalHighlightsSection';
import DestinationGridSection from './sections/DestinationGridSection';
import DistrictExplorerSection from './sections/DistrictExplorerSection';
import ExperienceGridSection from './sections/ExperienceGridSection';
import FAQSection from './sections/FAQSection';
import FeaturedStaysSection from './sections/FeaturedStaysSection';
import GuideSpotlightSection from './sections/GuideSpotlightSection';
import HeroSection from './sections/HeroSection';
import HomeSearchSection from './sections/HomeSearchSection';
import ImageGallerySection from './sections/ImageGallerySection';
import ImageTextSection from './sections/ImageTextSection';
import PackageShowcaseSection from './sections/PackageShowcaseSection';
import RichTextSection from './sections/RichTextSection';
import StatisticsStripSection from './sections/StatisticsStripSection';

const COMPONENTS = {
  hero: HeroSection,
  rich_text: RichTextSection,
  featured_destinations: DestinationGridSection,
  category_grid: CategoryGridSection,
  district_grid: DistrictExplorerSection,
  image_gallery: ImageGallerySection,
  cta_banner: CTABannerSection,
  faq: FAQSection,
  home_search: HomeSearchSection,
  featured_stays: FeaturedStaysSection,
  experience_grid: ExperienceGridSection,
  guide_spotlight: GuideSpotlightSection,
  package_showcase: PackageShowcaseSection,
  image_text: ImageTextSection,
  statistics_strip: StatisticsStripSection,
  cultural_highlights: CulturalHighlightsSection,
};

/**
 * The only approved CMS sections (W15): backend section type → { schema of the rendered data, Component }.
 * Must cover exactly the backend's types (sectionTypes.generated.js) — enforced by the registry test, so no
 * entry exists without a component and no backend type renders without validation.
 */
export const SECTION_REGISTRY = Object.freeze(
  Object.fromEntries(Object.entries(COMPONENTS).map(([type, Component]) => [type, Object.freeze({ schema: SECTION_SCHEMAS[type], Component })])),
);

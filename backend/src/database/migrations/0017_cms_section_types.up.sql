-- Eight more allowlisted CMS section types for the public homepage (frontend Phase 4, decision B14).
-- section_data is still validated against cms.sections.js before writing.
ALTER TABLE cms_page_sections DROP CONSTRAINT cms_page_sections_section_type_check;
ALTER TABLE cms_page_sections ADD CONSTRAINT cms_page_sections_section_type_check CHECK (section_type IN (
  'hero', 'rich_text', 'featured_destinations', 'category_grid',
  'district_grid', 'image_gallery', 'cta_banner', 'faq',
  'home_search', 'featured_stays', 'experience_grid', 'guide_spotlight',
  'package_showcase', 'image_text', 'statistics_strip', 'cultural_highlights'));

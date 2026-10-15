'use strict';

const config = require('../../config');

/**
 * NON-PRODUCTION demo content so frontend work can start before curated data exists.
 * Coordinates and text are approximate and NOT source-verified (Report §13 "Missing
 * Jharkhand content"); production content must be curated through the admin APIs.
 */
const DEMO = [
  {
    name: 'Hundru Falls', slug: 'hundru-falls', district: 'ranchi', lat: 23.4507, lng: 85.6514, featured: true,
    categories: ['waterfalls', 'eco-tourism'],
    summary: 'A tall waterfall on the Subarnarekha river, east of Ranchi.',
    description: 'Hundru Falls is formed where the Subarnarekha river drops off the Ranchi plateau. Best visited after the monsoon.',
  },
  {
    name: 'Dassam Falls', slug: 'dassam-falls', district: 'ranchi', lat: 23.1436, lng: 85.4669, featured: false,
    categories: ['waterfalls'],
    summary: 'A tiered waterfall on the Kanchi river near Taimara.',
    description: 'Dassam Falls cascades in several steps on the Kanchi river. Swimming is unsafe; visit with care.',
  },
  {
    name: 'Betla National Park', slug: 'betla-national-park', district: 'latehar', lat: 23.8869, lng: 84.1911, featured: true,
    categories: ['wildlife-national-parks', 'eco-tourism'],
    summary: 'Forest reserve within the Palamau Tiger Reserve.',
    description: 'Betla National Park protects sal and bamboo forest home to elephants, gaur and deer, with historic forts nearby.',
  },
  {
    name: 'Netarhat', slug: 'netarhat', district: 'latehar', lat: 23.4836, lng: 84.2675, featured: true,
    categories: ['hills-valleys'],
    summary: 'Hill station known for sunrise and sunset viewpoints.',
    description: 'Netarhat sits on a forested plateau, popular for Magnolia Point sunsets and cool weather.',
  },
  {
    name: 'Baidyanath Dham', slug: 'baidyanath-dham', district: 'deoghar', lat: 24.4924, lng: 86.7000, featured: false,
    categories: ['temples-pilgrimage'],
    summary: 'Major pilgrimage temple complex in Deoghar.',
    description: 'Baidyanath Dham is one of the most visited temple complexes in eastern India, especially during Shravani Mela.',
  },
  {
    name: 'Patratu Valley', slug: 'patratu-valley', district: 'ramgarh', lat: 23.6274, lng: 85.2981, featured: false,
    categories: ['hills-valleys', 'lakes-dams'],
    summary: 'Winding valley road with views over the Patratu reservoir.',
    description: 'Patratu Valley is known for its hairpin bends and the reservoir below, a short drive from Ranchi.',
  },
  {
    name: 'Parasnath Hill', slug: 'parasnath-hill', district: 'giridih', lat: 23.9622, lng: 86.1375, featured: false,
    categories: ['temples-pilgrimage', 'adventure'],
    summary: 'Highest peak in Jharkhand and a Jain pilgrimage site.',
    description: 'Parasnath Hill (Shikharji) is a sacred Jain site with a long pilgrimage trek to temples on the summit.',
  },
  {
    name: 'Dalma Wildlife Sanctuary', slug: 'dalma-wildlife-sanctuary', district: 'east-singhbhum', lat: 22.8833, lng: 86.2167, featured: false,
    categories: ['wildlife-national-parks', 'eco-tourism'],
    summary: 'Elephant habitat on the Dalma hills near Jamshedpur.',
    description: 'Dalma Wildlife Sanctuary covers forested hills that are an important corridor for wild elephants.',
  },
];

async function run(client) {
  if (config.isProduction) return 'skipped';
  for (const item of DEMO) {
    const { rows } = await client.query(
      `INSERT INTO destinations (district_id, name, slug, summary, description, geo_location, featured, status, published_at)
       SELECT d.id, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography, $8, 'published', now()
       FROM districts d WHERE d.slug = $1
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [item.district, item.name, item.slug, item.summary, item.description, item.lat, item.lng, item.featured],
    );
    if (rows.length === 0) continue;
    await client.query(
      `INSERT INTO destination_category_links (destination_id, category_id)
       SELECT $1, c.id FROM destination_categories c WHERE c.slug = ANY($2::text[])`,
      [rows[0].id, item.categories],
    );
  }
}

module.exports = { run };

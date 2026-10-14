'use strict';

// Initial eco & cultural tourism categories (insert-only; admins may edit afterwards).
const CATEGORIES = [
  ['Waterfalls', 'waterfalls', 'waterfall', 'Cascades and falls across the Chotanagpur plateau'],
  ['Wildlife & National Parks', 'wildlife-national-parks', 'paw', 'Sanctuaries, tiger reserves and national parks'],
  ['Hills & Valleys', 'hills-valleys', 'mountain', 'Hill stations, viewpoints and valleys'],
  ['Lakes & Dams', 'lakes-dams', 'water', 'Reservoirs, lakes and dam sites'],
  ['Temples & Pilgrimage', 'temples-pilgrimage', 'temple', 'Sacred sites and pilgrimage centres'],
  ['Tribal Culture & Heritage', 'tribal-culture-heritage', 'drum', 'Adivasi villages, crafts, festivals and living heritage'],
  ['Historical Monuments', 'historical-monuments', 'landmark', 'Forts, palaces and historic sites'],
  ['Parks & Gardens', 'parks-gardens', 'tree', 'Urban parks, gardens and recreation areas'],
  ['Adventure', 'adventure', 'compass', 'Trekking, rock climbing, rafting and outdoor adventure'],
  ['Eco-Tourism', 'eco-tourism', 'leaf', 'Community-based and low-impact nature experiences'],
];

async function run(client) {
  for (const [name, slug, icon, description] of CATEGORIES) {
    await client.query(
      'INSERT INTO destination_categories (name, slug, icon, description) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING',
      [name, slug, icon, description],
    );
  }
}

module.exports = { run, CATEGORIES };

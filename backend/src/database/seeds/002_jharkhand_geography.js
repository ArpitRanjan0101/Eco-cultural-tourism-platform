'use strict';

/**
 * Jharkhand administrative divisions (regions) and their 24 districts with
 * approximate district-headquarters coordinates. Insert-only (ON CONFLICT DO
 * NOTHING) so administrator edits are never overwritten by re-seeding.
 */
const REGIONS = [
  {
    name: 'Palamu', slug: 'palamu',
    districts: [
      ['Palamu', 'palamu', 24.0300, 84.0700],
      ['Garhwa', 'garhwa', 24.1600, 83.8100],
      ['Latehar', 'latehar', 23.7440, 84.5000],
    ],
  },
  {
    name: 'North Chotanagpur', slug: 'north-chotanagpur',
    districts: [
      ['Hazaribagh', 'hazaribagh', 23.9925, 85.3637],
      ['Chatra', 'chatra', 24.2068, 84.8710],
      ['Koderma', 'koderma', 24.4677, 85.5940],
      ['Giridih', 'giridih', 24.1913, 86.2996],
      ['Ramgarh', 'ramgarh', 23.6302, 85.5130],
      ['Bokaro', 'bokaro', 23.6693, 86.1511],
      ['Dhanbad', 'dhanbad', 23.7957, 86.4304],
    ],
  },
  {
    name: 'South Chotanagpur', slug: 'south-chotanagpur',
    districts: [
      ['Ranchi', 'ranchi', 23.3441, 85.3096],
      ['Khunti', 'khunti', 23.0717, 85.2789],
      ['Gumla', 'gumla', 23.0441, 84.5379],
      ['Simdega', 'simdega', 22.6170, 84.5120],
      ['Lohardaga', 'lohardaga', 23.4330, 84.6830],
    ],
  },
  {
    name: 'Kolhan', slug: 'kolhan',
    districts: [
      ['East Singhbhum', 'east-singhbhum', 22.8046, 86.2029],
      ['West Singhbhum', 'west-singhbhum', 22.5541, 85.8066],
      ['Seraikela Kharsawan', 'seraikela-kharsawan', 22.6990, 85.9310],
    ],
  },
  {
    name: 'Santhal Pargana', slug: 'santhal-pargana',
    districts: [
      ['Dumka', 'dumka', 24.2676, 87.2497],
      ['Jamtara', 'jamtara', 23.9630, 86.8030],
      ['Deoghar', 'deoghar', 24.4820, 86.6960],
      ['Godda', 'godda', 24.8270, 87.2130],
      ['Sahibganj', 'sahibganj', 25.2500, 87.6330],
      ['Pakur', 'pakur', 24.6330, 87.8500],
    ],
  },
];

async function run(client) {
  for (const region of REGIONS) {
    await client.query('INSERT INTO regions (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING', [region.name, region.slug]);
    for (const [name, slug, latitude, longitude] of region.districts) {
      await client.query(
        `INSERT INTO districts (region_id, name, slug, location)
         SELECT r.id, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography FROM regions r WHERE r.slug = $1
         ON CONFLICT (slug) DO NOTHING`,
        [region.slug, name, slug, latitude, longitude],
      );
    }
  }
}

module.exports = { run, REGIONS };

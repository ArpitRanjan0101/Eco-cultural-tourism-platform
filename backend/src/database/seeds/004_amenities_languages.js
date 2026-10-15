'use strict';

// Reference amenities and guide languages (insert-only; admins may edit afterwards).
const AMENITIES = [
  ['wifi', 'Wi-Fi', 'connectivity', 'wifi'],
  ['parking', 'Parking', 'general', 'parking'],
  ['power_backup', 'Power backup', 'general', 'battery'],
  ['restaurant', 'Restaurant', 'food', 'utensils'],
  ['room_service', 'Room service', 'food', 'bell'],
  ['local_cuisine', 'Local cuisine', 'food', 'bowl'],
  ['air_conditioning', 'Air conditioning', 'room', 'snowflake'],
  ['television', 'Television', 'room', 'tv'],
  ['mosquito_net', 'Mosquito net', 'room', 'shield'],
  ['attached_bathroom', 'Attached bathroom', 'bathroom', 'bath'],
  ['hot_water', 'Hot water', 'bathroom', 'droplet'],
  ['swimming_pool', 'Swimming pool', 'outdoor', 'pool'],
  ['garden', 'Garden', 'outdoor', 'tree'],
  ['campfire', 'Campfire', 'outdoor', 'flame'],
  ['guided_treks', 'Guided treks', 'outdoor', 'footprints'],
  ['wheelchair_access', 'Wheelchair access', 'accessibility', 'wheelchair'],
  ['cctv', 'CCTV', 'safety', 'camera'],
  ['first_aid', 'First aid', 'safety', 'first-aid'],
  ['laundry', 'Laundry', 'general', 'shirt'],
];

const LANGUAGES = [
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['bn', 'Bengali'],
  ['or', 'Odia'],
  ['ur', 'Urdu'],
  ['sat', 'Santali'],
  ['unr', 'Mundari'],
  ['kru', 'Kurukh'],
  ['hoc', 'Ho'],
  ['khr', 'Kharia'],
  ['sck', 'Nagpuri (Sadri)'],
];

async function run(client) {
  for (const [code, name, category, icon] of AMENITIES) {
    await client.query('INSERT INTO amenities (code, name, category, icon) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING', [code, name, category, icon]);
  }
  for (const [code, name] of LANGUAGES) {
    await client.query('INSERT INTO guide_languages (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING', [code, name]);
  }
}

module.exports = { run, AMENITIES, LANGUAGES };

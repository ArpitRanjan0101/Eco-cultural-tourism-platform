'use strict';

// Ordered route definitions of every delivered module (static paths before params).
const authRoutes = require('./auth/auth.routes');
const usersRoutes = require('./users/users.routes');
const mediaRoutes = require('./media/media.routes');
const geographyRoutes = require('./geography/geography.routes');
const destinationsRoutes = require('./destinations/destinations.routes');
const cmsRoutes = require('./cms/cms.routes');
const searchRoutes = require('./search/search.routes');
const partnersRoutes = require('./partners/partners.routes');
const propertiesRoutes = require('./properties/properties.routes');
const guidesRoutes = require('./guides/guides.routes');
const experiencesRoutes = require('./experiences/experiences.routes');
const packagesRoutes = require('./packages/packages.routes');
const bookingsRoutes = require('./bookings/bookings.routes');

module.exports = [
  ...authRoutes,
  ...usersRoutes,
  ...mediaRoutes,
  ...geographyRoutes,
  ...destinationsRoutes,
  ...cmsRoutes,
  ...searchRoutes,
  ...partnersRoutes,
  ...propertiesRoutes,
  ...guidesRoutes,
  ...experiencesRoutes,
  ...packagesRoutes,
  ...bookingsRoutes,
];

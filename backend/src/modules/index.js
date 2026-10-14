'use strict';

// Ordered route definitions of every delivered module (static paths before params).
const authRoutes = require('./auth/auth.routes');
const usersRoutes = require('./users/users.routes');

module.exports = [...authRoutes, ...usersRoutes];

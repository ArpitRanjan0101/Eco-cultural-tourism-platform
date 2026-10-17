import { api } from '@/lib/api/client';

// Session routes are served by dedicated BFF handlers (/api/auth/*, /api/session); the other auth operations go
// through the contract-allowlisted forwarder (/api/v1/auth/*). Contracts: API_MAPPING.md, "Auth".

export const authService = {
  getSession: async () => (await api.get('/api/session')).data,
  login: async ({ email, password }) => (await api.post('/api/auth/login', { email, password })).data.user,
  logout: () => api.post('/api/auth/logout'),
  logoutAll: () => api.post('/api/auth/logout-all'),
  register: async ({ fullName, email, password }) => (await api.post('/api/v1/auth/register', { fullName, email, password })).data,
  forgotPassword: async ({ email }) => (await api.post('/api/v1/auth/forgot-password', { email })).data,
  resetPassword: ({ token, newPassword }) => api.post('/api/v1/auth/reset-password', { token, newPassword }),
  verifyEmail: async ({ token }) => (await api.post('/api/v1/auth/verify-email', { token })).data,
  resendVerification: async ({ email }) => (await api.post('/api/v1/auth/resend-verification', { email })).data,
};

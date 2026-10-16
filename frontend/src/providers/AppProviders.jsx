'use client';

// Single client boundary for app-wide providers (TanStack Query, session, toasts arrive in later phases).
export default function AppProviders({ children }) {
  return children;
}

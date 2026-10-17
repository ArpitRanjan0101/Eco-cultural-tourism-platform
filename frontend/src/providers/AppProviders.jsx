'use client';

import { ToastProvider } from '@/components/feedback/Toast';

// Single client boundary for app-wide providers (TanStack Query and session arrive in Phase 3).
export default function AppProviders({ children }) {
  return <ToastProvider>{children}</ToastProvider>;
}

'use client';

import { ToastProvider } from '@/components/feedback/Toast';
import QueryProvider from './QueryProvider';

// Single client boundary for app-wide providers.
export default function AppProviders({ children }) {
  return (
    <QueryProvider>
      <ToastProvider>{children}</ToastProvider>
    </QueryProvider>
  );
}

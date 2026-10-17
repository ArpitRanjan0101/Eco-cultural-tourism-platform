'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/api/queryKeys';
import { authService } from '../services/authService';

/** Current user (AuthenticatedUser) or null. `initialUser` seeds it from a server render. */
export function useSession(initialUser) {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: authService.getSession,
    ...(initialUser === undefined ? {} : { initialData: initialUser }),
  });
}

/** Sign out of this browser (`everywhere: true` revokes every session), then return to `redirectTo`. */
export function useSignOut({ everywhere = false, redirectTo = '/login' } = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: everywhere ? authService.logoutAll : authService.logout,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.session, null);
      router.replace(redirectTo);
      router.refresh();
    },
  });
}

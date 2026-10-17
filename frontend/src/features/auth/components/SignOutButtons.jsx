'use client';

import { useState } from 'react';
import ConfirmationDialog from '@/components/feedback/ConfirmationDialog';
import Button from '@/components/ui/Button';
import { useSignOut } from '../hooks/useSession';
import FormMessage from './FormMessage';

/** "Sign out" and "Sign out everywhere" (revokes every session after confirmation). */
export default function SignOutButtons() {
  const signOut = useSignOut();
  const signOutAll = useSignOut({ everywhere: true });
  const [confirmAll, setConfirmAll] = useState(false);
  const error = signOut.error ?? signOutAll.error;

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormMessage message="Could not sign out. Please try again." requestId={error.requestId} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" loading={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out
        </Button>
        <Button variant="ghost" onClick={() => setConfirmAll(true)}>
          Sign out everywhere
        </Button>
      </div>
      <ConfirmationDialog
        open={confirmAll}
        title="Sign out on every device?"
        description="All your sessions, including this one, will end."
        confirmLabel="Sign out everywhere"
        tone="danger"
        loading={signOutAll.isPending}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => signOutAll.mutate(undefined, { onSettled: () => setConfirmAll(false) })}
      />
    </div>
  );
}

'use client';

import { useRef } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';

/**
 * Confirms a consequential action. Focus starts on Cancel so Enter never confirms by accident.
 * @param {{ open: boolean, title: string, description?: string, children?: React.ReactNode,
 *   confirmLabel?: string, cancelLabel?: string, tone?: 'primary'|'danger', loading?: boolean,
 *   onConfirm: () => void, onCancel: () => void }} props
 * While `loading`, both buttons are disabled and dismissal is blocked until the action settles.
 */
export default function ConfirmationDialog({ open, title, description, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', loading = false, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  const close = () => {
    if (!loading) onCancel();
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      closeOnBackdrop={!loading}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="outline" onClick={close} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

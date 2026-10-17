'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Drawer from '@/components/ui/Drawer';

/**
 * Filters for small screens: a button opening a bottom drawer that contains the same filter form
 * (passed as children from the server, so there is one form definition).
 * @param {{ activeCount: number, children: React.ReactNode }} props
 */
export default function MobileFilterDrawer({ activeCount, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <Button variant="outline" onClick={() => setOpen(true)} aria-expanded={open}>
        {activeCount ? `Filters (${activeCount})` : 'Filters'}
      </Button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Filters" side="bottom" closeLabel="Close filters">
        {children}
      </Drawer>
    </div>
  );
}

'use client';

import { ModalSurface } from './Dialog';

const SIDES = {
  right: 'my-0 ml-auto mr-0 h-dvh max-h-dvh w-[min(100%,24rem)]',
  left: 'my-0 ml-0 mr-auto h-dvh max-h-dvh w-[min(100%,24rem)]',
  bottom: 'mx-0 mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-lg',
};

/**
 * Edge-anchored modal panel (mobile navigation, filters). Same behaviour as Dialog.
 * @param {{ open: boolean, onClose: () => void, title: string, side?: 'right'|'left'|'bottom',
 *   description?: string, footer?: React.ReactNode, closeLabel?: string, children: React.ReactNode }} props
 */
export default function Drawer({ side = 'right', ...props }) {
  return <ModalSurface {...props} panelClassName={SIDES[side] ?? SIDES.right} />;
}

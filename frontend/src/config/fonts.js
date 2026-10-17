import { Noto_Sans, Noto_Serif } from 'next/font/google';

// Self-hosted at build time by next/font (no runtime request to Google). Noto covers Devanagari later (WO6).
export const bodyFont = Noto_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
export const headingFont = Noto_Serif({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-heading', display: 'swap' });

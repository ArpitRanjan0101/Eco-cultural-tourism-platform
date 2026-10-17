import { getServerEnv } from '@/config/env.server';
import { bodyFont, headingFont } from '@/config/fonts';
import { site } from '@/config/site';
import { colors } from '@/config/theme';
import AppProviders from '@/providers/AppProviders';
import './globals.css';

// metadataBase makes Open Graph and canonical URLs absolute. Pages prerendered at build time have no runtime
// configuration (secrets are never baked into the image), so they get no base; at runtime APP_ORIGIN is
// always present because the server refuses to start without valid configuration (W19).
export function generateMetadata() {
  return {
    title: { default: site.name, template: `%s | ${site.shortName}` },
    description: site.description,
    ...(process.env.APP_ORIGIN ? { metadataBase: new URL(getServerEnv().APP_ORIGIN) } : {}),
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: colors.primary,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

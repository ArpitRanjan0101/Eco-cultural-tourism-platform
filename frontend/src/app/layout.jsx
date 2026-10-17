import { bodyFont, headingFont } from '@/config/fonts';
import { site } from '@/config/site';
import { colors } from '@/config/theme';
import AppProviders from '@/providers/AppProviders';
import './globals.css';

export const metadata = {
  title: { default: site.name, template: `%s | ${site.shortName}` },
  description: site.description,
};

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

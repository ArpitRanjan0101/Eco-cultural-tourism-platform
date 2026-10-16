import { site } from '@/config/site';
import AppProviders from '@/providers/AppProviders';
import './globals.css';

export const metadata = {
  title: { default: site.name, template: `%s | ${site.shortName}` },
  description: site.description,
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

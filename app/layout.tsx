import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import { LangProvider } from '@/lib/i18n';
import './globals.css';
import { THEME_BOOT } from '@/lib/themes';


export const metadata: Metadata = {
  title: { default: 'Tokken · Rob De Rop Digital', template: '%s · Tokken' },
  description: 'Tokken, het kaartspel met knikkers uit Dilbeek, online met je vrienden. Een spel van Rob De Rop Digital.',
  applicationName: 'Tokken',
  authors: [{ name: 'Rob De Rop Digital' }],
  creator: 'Rob De Rop Digital',
  openGraph: { title: 'Tokken', description: 'Het kaartspel met knikkers uit Dilbeek. Een spel van Rob De Rop Digital.', siteName: 'Tokken · Rob De Rop Digital' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#33558c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} /></head>
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}

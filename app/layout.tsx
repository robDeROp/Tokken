import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/kalam/400.css';
import '@fontsource/kalam/700.css';
import { LangProvider } from '@/lib/i18n';
import './globals.css';


export const metadata: Metadata = {
  title: 'Tokken',
  description: 'Het kaartspel met knikkers uit Dilbeek, online met je vrienden.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#33558c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}

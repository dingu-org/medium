import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';

import './globals.css';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Without a base, Next leaves `alternates.canonical` and the hreflang links
  // on the legal pages as relative hrefs, which crawlers cannot resolve.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  ),
  applicationName: 'Medium',
  title: 'Medium',
  description:
    'Asistent për menaxhimin e takimeve në WhatsApp për fizioterapistë.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-256.png', sizes: '256x256', type: 'image/png' },
      { url: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'Medium',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#f3f3f0',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sq"
      className={`${manrope.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body
        className={`bg-background text-foreground flex min-h-full flex-col`}
      >
        <SpeedInsights />
        {children}
      </body>
    </html>
  );
}

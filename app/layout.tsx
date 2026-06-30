import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';

import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
});

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
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
  themeColor: '#1f5d86',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sq"
      className={`${inter.variable} ${interTight.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body
        className={`bg-background text-foreground flex min-h-full flex-col`}
      >
        {children}
      </body>
    </html>
  );
}

import { Analytics } from '@vercel/analytics/next'
import { GoogleAnalytics } from '@next/third-parties/google'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Lora } from 'next/font/google'
import { IdleLogout } from '@/components/idle-logout'
import { ServiceWorkerRegister } from '@/components/sw-register'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})
const lora = Lora({ variable: '--font-lora', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://www.voxyfi.com'),
  title: 'VOXYFI — Listen to anything',
  description:
    'VOXYFI turns any text into natural-sounding speech. Paste an article, document, or note and listen with word-by-word highlighting, adjustable speed, and multiple voices.',
  applicationName: 'VOXYFI',
  generator: 'v0.app',
  appleWebApp: {
    capable: true,
    title: 'VOXYFI',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'VOXYFI',
    url: 'https://www.voxyfi.com',
    title: 'VOXYFI — Listen to anything',
    description:
      'Turn any text into natural-sounding speech. Paste an article, document, or note and listen with word-by-word highlighting, adjustable speed, and multiple voices.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VOXYFI — Listen to anything',
    description:
      'Turn any text into natural-sounding speech with word-by-word highlighting, adjustable speed, and multiple voices.',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png?v=5',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png?v=5',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg?v=5',
        type: 'image/svg+xml',
      },
    ],
    shortcut: '/favicon.ico?v=5',
    apple: '/apple-icon.png?v=5',
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f2ea' },
    { media: '(prefers-color-scheme: dark)', color: '#2b2926' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {/* Discoverability for humans.txt (React 19 hoists this into <head>). */}
        <link rel="author" type="text/plain" href="/humans.txt" />
        {children}
        <IdleLogout />
        <ServiceWorkerRegister />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
      {process.env.NODE_ENV === 'production' && (
        <GoogleAnalytics gaId="G-3WCGXECSTL" />
      )}
    </html>
  )
}

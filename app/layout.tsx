import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Orbit · Say it, Roisin does it',
    template: '%s · Orbit',
  },
  description:
    'Orbit is a voice companion that turns what you say into working software through native.builder.',
}

export const viewport: Viewport = {
  themeColor: '#1b1424',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

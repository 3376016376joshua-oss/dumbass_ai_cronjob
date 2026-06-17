import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../styles/vintage.css';
import '../styles/model-detail-v4.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://dumbass-ai-cronjob.vercel.app'),
  title: 'AI Model Comparison Snapshot',
  description: 'Daily coding score comparison snapshot for the selected AI models.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

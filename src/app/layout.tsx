import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '4Scans — Elite Crypto Signal Bot',
  description: 'ICT + Wyckoff multi-TF elite crypto futures scanner with 4-style signal output',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}

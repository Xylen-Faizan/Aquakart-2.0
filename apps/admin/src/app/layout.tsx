import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AquaKart Admin',
  description: 'AquaKart 2.0 Admin Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body>
    </html>
  );
}

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
      <body>{children}</body>
    </html>
  );
}

import './globals.css'; // Ścieżka musi być poprawna!
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Interview App',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}

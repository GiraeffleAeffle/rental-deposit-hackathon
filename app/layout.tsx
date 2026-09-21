import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deposit workspace · A clearer way home',
  description:
    'Explore a shared workspace for rental deposits, fair settlement, and personal savings. Interactive prototype with fictional data. Brand and chain selection are in progress.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

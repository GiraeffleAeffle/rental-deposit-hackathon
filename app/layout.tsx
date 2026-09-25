import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import { WalletProvider } from '@/wallets';

export const metadata: Metadata = {
  title: 'Deposit workspace · Make room for your future',
  description:
    'A shared rental workspace with a separate personal investing journey. Explore the persistent demonstration and inspect connected integration evidence.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

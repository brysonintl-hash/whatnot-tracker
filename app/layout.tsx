import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Stack Bargains',
  description: 'Enterprise Logistics & Inventory Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            try {
              if (localStorage.getItem('theme') === 'dark' || !localStorage.getItem('theme')) {
                document.documentElement.classList.add('dark');
              }
            } catch(e) {}
          `
        }} />
      </head>
      <body className={inter.className} style={{ background: '#080808' }}>
        {/* Fixed blurred background — visible through glass panels */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: '-30px',
            backgroundImage: 'url(/bg.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(9px)',
          }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)' }} />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}

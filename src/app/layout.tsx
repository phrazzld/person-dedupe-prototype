import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Person Dedupe — Reference Prototype',
  description: 'Duplicate person-record detection, review, and merge.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">
              <span className="dot" />
              Person Dedupe
            </div>
            <nav className="app-nav">
              <Link href="/duplicates">Duplicates</Link>
              <Link href="/people">People</Link>
              <Link href="/merges">Merges</Link>
            </nav>
          </header>
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}

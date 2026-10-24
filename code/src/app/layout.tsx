
import type { Metadata } from 'next';
import './globals.css';
import { getGeneralSettings } from '@/lib/data.actions';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getGeneralSettings();
  const favicon = '/img/epyvra-icon-512.png';
  const siteName = settings?.siteName || 'EPYVRA';
  
  return {
    title: settings?.seoTitle || siteName,
    description: settings?.seoDescription || 'Explore a Universe of Drama.',
    keywords: settings?.seoKeywords || 'drama, movies, reels, streaming',
    verification: {
      google: '0TfOtLYeJnVa237rNbYKxgppW7YjupdxwKOzpdVqDP8',
    },
    manifest: '/manifest.webmanifest',
    icons: {
        icon: [
            { url: favicon },
            { url: favicon, sizes: '32x32', type: 'image/png' },
            { url: favicon, sizes: '16x16', type: 'image/png' },
        ],
        apple: [
            { url: '/img/epyvra-apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
        shortcut: [favicon],
    },
  };
}

import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
       <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9454038375655711"
          crossOrigin="anonymous"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#f857a6" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body className={inter.className}>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof Node === 'function' && Node.prototype) {
                const originalRemoveChild = Node.prototype.removeChild;
                Node.prototype.removeChild = function(child) {
                  if (child.parentNode !== this) {
                    if (console) {
                      console.warn('Cannot remove a child from a different parent', child, this);
                    }
                    return child;
                  }
                  return originalRemoveChild.apply(this, arguments);
                };
              
                const originalInsertBefore = Node.prototype.insertBefore;
                Node.prototype.insertBefore = function(newNode, referenceNode) {
                  if (referenceNode && referenceNode.parentNode !== this) {
                    if (console) {
                      console.warn('Cannot insert before a reference node from a different parent', referenceNode, this);
                    }
                    return newNode;
                  }
                  return originalInsertBefore.apply(this, arguments);
                };
              }
            `,
          }}
        />
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

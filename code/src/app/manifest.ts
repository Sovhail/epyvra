import { MetadataRoute } from 'next';
import { getGeneralSettings } from '@/lib/data.actions';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getGeneralSettings();
  const siteName = settings?.siteName || 'EPYVRA';

  return {
    name: siteName,
    short_name: siteName,
    description: settings?.seoDescription || 'Explore a Universe of Drama.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#f857a6',
    icons: [
      {
        src: '/img/epyvra-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/img/epyvra-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/img/epyvra-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}

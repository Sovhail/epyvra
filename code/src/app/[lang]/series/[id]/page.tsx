import { getSeriesBySlugOrId, getEpisodesForSeries } from '@/lib/data';
import type { Metadata } from 'next';
import { SeriesDetailView } from '@/components/series-detail-view';
import { notFound } from 'next/navigation';

export const revalidate = 60; // Cache for 60 seconds

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const series = await getSeriesBySlugOrId(id);

  if (!series) {
    return {
      title: 'Not Found',
      description: 'This series does not exist.',
    };
  }

  return {
    title: series.seoTitle || series.title,
    description: series.metaDescription || series.description,
    keywords: series.metaKeywords || series.genres,
  };
}

export default async function SeriesDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const series = await getSeriesBySlugOrId(id);
    if (!series) {
        notFound();
    }

    const episodes = await getEpisodesForSeries(series.id);
    const clientEpisodes = episodes.map(episode => ({
        ...episode,
        mediaAuthorizationRequired: true,
        videoSources: episode.videoSources?.map(source => ({ ...source, url: '' })),
    }));
    const initialVideoUrl = '';

    return (
        <SeriesDetailView 
            key={series.id} 
            initialSeries={series} 
            initialEpisodes={clientEpisodes}
            initialVideoUrl={initialVideoUrl}
        />
    );
}

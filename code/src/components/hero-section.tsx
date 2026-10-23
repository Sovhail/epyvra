'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Autoplay from 'embla-carousel-autoplay';
import { Play, Sparkles, Star } from 'lucide-react';
import * as React from 'react';

import type { Series } from '@/lib/types';
import { i18n } from '@/i18n-config';
import { useSettings } from '@/lib/settings-provider';
import { useTranslation } from '@/lib/translation-provider';
import { cn } from '@/lib/utils';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Button } from '@/components/ui/button';

interface HeroSectionProps {
  series: Series[];
}

export function HeroSection({ series }: HeroSectionProps) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const settings = useSettings();
  const { t } = useTranslation();
  const params = useParams();
  const lang = (params?.lang as string) || i18n.defaultLocale;
  const langPrefix = lang === i18n.defaultLocale ? '' : `/${lang}`;
  const autoplay = React.useRef(
    Autoplay({
      delay: 5000,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    })
  );

  React.useEffect(() => {
    if (!api) return;

    const updateCurrent = () => setCurrent(api.selectedScrollSnap());
    updateCurrent();
    api.on('select', updateCurrent);
    api.on('reInit', updateCurrent);

    return () => {
      api.off('select', updateCurrent);
      api.off('reInit', updateCurrent);
    };
  }, [api]);

  const getSeriesUrl = (item: Series) => {
    const path = settings?.seriesUrlFormat === 'slug' && item.slug
      ? `/series/${item.slug}`
      : `/series/${item.id}`;
    return `${langPrefix}${path}`;
  };

  if (!series?.length) {
    return (
      <section className="flex min-h-[440px] items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-background pt-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-[0_0_45px_hsl(var(--primary)/0.25)]">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">EPYVRA</h1>
          <p className="mt-4 text-base text-white/55 sm:text-lg">Stories in every swipe.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative overflow-hidden bg-slate-950 w-full"
      aria-label="Featured series"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {series.map((item, index) => (
          <Image
            key={item.id}
            src={item.featuredCoverUrl || item.coverUrl || '/img/no-cover.svg'}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
            className={cn(
              'scale-125 object-cover blur-3xl transition-opacity duration-700',
              current === index ? 'opacity-55' : 'opacity-0'
            )}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/75 to-background" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <Carousel
        setApi={setApi}
        className="relative z-10 w-full"
        plugins={[autoplay.current]}
        opts={{
          align: 'center',
          loop: series.length > 1,
          skipSnaps: false,
        }}
      >
        <CarouselContent className="items-center h-[50vh] sm:h-[60vh] md:h-[65vh] lg:h-[75vh] min-h-[400px] max-h-[700px]">
          {series.map((item, index) => {
            const isActive = current === index;

            return (
              <CarouselItem
                key={item.id}
                className="flex basis-full justify-center h-full"
              >
                <div
                  className={cn(
                    'group relative block w-full h-full overflow-hidden bg-zinc-950 transition-opacity duration-700 ease-out',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  <div className="relative w-full h-full">
                    <Image
                      src={item.featuredCoverUrl || item.coverUrl || '/img/no-cover.svg'}
                      alt={item.title}
                      fill
                      priority={index === 0}
                      sizes="100vw"
                      className="object-cover transition-transform [transition-duration:10s] group-hover:scale-105"
                    />

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
                    
                    {/* Content overlay */}
                    <div className="absolute bottom-0 left-0 z-20 flex w-full flex-col items-start gap-4 p-6 pb-14 sm:gap-5 sm:p-12 sm:pb-20 md:p-16 md:pb-24 lg:p-24 lg:pb-28">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/80 sm:text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 backdrop-blur-md">
                            <Sparkles className="h-3.5 w-3.5 text-primary" /> EPYVRA Original
                          </span>
                          {item.releaseYear && <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1.5 backdrop-blur-md">{item.releaseYear}</span>}
                          {item.isPremium && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/15 px-3 py-1.5 text-amber-200 backdrop-blur-md"><Star className="h-3 w-3 fill-current" /> Premium</span>}
                        </div>
                        <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white drop-shadow-2xl line-clamp-2 max-w-4xl">
                           {item.title}
                        </h2>
                        {item.description && <p className="hidden max-w-2xl text-sm leading-relaxed text-white/70 drop-shadow-lg sm:line-clamp-2 sm:text-base md:block">{item.description}</p>}
                        
                        <Link href={getSeriesUrl(item)}>
                            <Button size="lg" className="rounded-full bg-gradient-to-r from-primary to-accent px-7 py-6 text-base font-black text-white shadow-[0_15px_45px_hsl(var(--primary)/0.35)] transition-all hover:scale-105 hover:shadow-[0_18px_55px_hsl(var(--primary)/0.5)] active:scale-95 sm:px-10 sm:py-7 sm:text-lg">
                                <Play className="w-5 h-5 sm:w-6 sm:h-6 mr-2 fill-current" />
                                {t('hero_watch_now') || 'Watch Now'}
                            </Button>
                        </Link>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        {series.length > 1 && (
            <>
                <CarouselPrevious className="hidden sm:flex left-4 sm:left-8 bg-black/40 border-0 hover:bg-black/70 hover:scale-110 text-white w-12 h-12 transition-all" />
                <CarouselNext className="hidden sm:flex right-4 sm:right-8 bg-black/40 border-0 hover:bg-black/70 hover:scale-110 text-white w-12 h-12 transition-all" />
            </>
        )}
      </Carousel>

      {series.length > 1 && (
        <div className="absolute bottom-4 sm:bottom-8 left-0 right-0 z-30 flex items-center justify-center gap-2" role="tablist" aria-label="Featured slides">
          {series.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-label={`Show ${item.title}`}
              aria-selected={current === index}
              onClick={() => api?.scrollTo(index)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                current === index
                  ? 'w-7 bg-primary shadow-[0_0_14px_hsl(var(--primary)/0.55)]'
                  : 'w-2 bg-white/35 hover:bg-white/60'
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

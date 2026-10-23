'use client';
import Link from 'next/link';
import { Search, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useUser } from '@/firebase';
import { AuthDialog } from '@/components/auth-dialog';
import { UserButton } from '@/components/user-button';
import { Skeleton } from './ui/skeleton';
import React from 'react';
import { SearchDialog } from './search-dialog';
import { LanguageSwitcher } from './language-switcher';
import { useParams } from 'next/navigation';
import { i18n } from '@/i18n-config';
import { useTranslation } from '@/lib/translation-provider';
import { useSettings } from '@/lib/settings-provider';
import Image from 'next/image';

const DynamicLogo = () => {
    const settings = useSettings();
    const showName = settings?.showSiteNameNextToLogo !== false;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-shrink-0">
                <Image src="/img/epyvra-logo.png" alt="EPYVRA" width={128} height={128} priority className="h-10 w-10 rounded-md object-contain" />
            </div>
            {showName && settings?.siteName && (
                <span className="text-lg font-bold text-white tracking-tight flex items-center h-full">
                    {settings.siteName}
                </span>
            )}
        </div>
    );
};

export function Header() {
  const { user, loading } = useUser();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  
  const params = useParams();
  const lang = (params?.lang as string) || i18n.defaultLocale;
  const langPrefix = lang === i18n.defaultLocale ? '' : `/${lang}`;

  React.useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  return (
    <header className={`fixed top-0 z-40 w-full transition-all duration-300 ${scrolled ? 'border-b border-white/10 bg-background/85 shadow-2xl shadow-black/20 backdrop-blur-xl' : 'bg-gradient-to-b from-black/85 to-transparent'}`}>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <div className={`container mx-auto flex items-center justify-between px-4 transition-all duration-300 ${scrolled ? 'h-14' : 'h-16 md:h-20'}`}>
        <div className="flex items-center gap-4">
          <Link href={langPrefix || '/'} className="rounded-xl hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <DynamicLogo />
          </Link>
          
          <div className="md:hidden">
            <LanguageSwitcher isMobile />
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium ml-4">
            <Link href={langPrefix || '/'} className="text-white/80 hover:text-white transition-colors">{t('common_home')}</Link>
            <Link href={`${langPrefix}/series`} className="text-white/80 hover:text-white transition-colors">{t('common_categories')}</Link>
            <Link href={`${langPrefix}/my-list`} className="text-white/80 hover:text-white transition-colors">{t('header_my_list')}</Link>
          </nav>
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden md:block">
            <LanguageSwitcher />
          </div>

          <Button aria-label={t('common_search') || 'Search'} variant="ghost" size="icon" className="rounded-full text-white hover:bg-white/10" onClick={() => setSearchOpen(true)}>
            <Search className="h-5 w-5" />
          </Button>

          {/* User Button visible on ALL screen sizes */}
          <div className="ml-1">
            {loading ? <Skeleton className="h-10 w-10 rounded-full" /> : user ? <UserButton /> : <AuthDialog />}
          </div>

          <div className="md:hidden flex items-center ml-1">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white"><Menu className="h-6 w-6" /></Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] bg-background p-6 border-l-border/50 flex flex-col">
                <SheetHeader className="sr-only"><SheetTitle>{t('header_main_menu')}</SheetTitle></SheetHeader>
                <div className="flex flex-col h-full mt-4">
                    <nav className="flex flex-col gap-5 flex-1">
                        <Link href={langPrefix || '/'} className="flex items-center gap-3 text-base font-medium" onClick={() => setMobileMenuOpen(false)}>
                            {t('common_home')}
                        </Link>
                        <Link href={`${langPrefix}/series`} className="flex items-center gap-3 text-base font-medium" onClick={() => setMobileMenuOpen(false)}>
                            {t('common_categories')}
                        </Link>
                        <Link href={`${langPrefix}/my-list`} className="flex items-center gap-3 text-base font-medium" onClick={() => setMobileMenuOpen(false)}>
                            {t('header_my_list')}
                        </Link>
                        <Link href={`${langPrefix}/contact`} className="flex items-center gap-3 text-base font-medium" onClick={() => setMobileMenuOpen(false)}>
                            {t('footer_contact_us')}
                        </Link>
                    </nav>
                </div>
                </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}

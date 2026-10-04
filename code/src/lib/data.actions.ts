'use server';
import { getErrorMessage } from '@/lib/error-utils';
import type { Document, WithId } from 'mongodb';
import { getDb } from './mongodb';
import type { Series, Episode, CoinPack, MonetizationSettings, Purchase, Ad, GeneralSettings, Language, UITranslations, CustomPage, ContactMessage, Report, Category, PluginsSettings, RewardTask, RewardsSettings, UserRewardClaim, CoinTransaction, PaymentGatewaySettings, AdminProfile, Favorite, WatchHistory, StorageSettings } from './types';
import { isDemoMode } from './demo-mode';
import { safeFetch } from './safe-fetch';
import { getQueryById, mapDoc } from './actions/utils';

type StringIdDocument = { _id: string; [key: string]: unknown };

async function canReadPrivateSettings(): Promise<boolean> {
    return import('./actions/auth').then(({ verifyAdminSession }) => verifyAdminSession());
}

function publicGeneralSettings(settings: GeneralSettings): GeneralSettings {
    const {
        id, siteName, siteUrl, logoUrl, faviconUrl, copyrightText, appVersion, seriesUrlFormat,
        defaultLanguageCode, showSocialsInFooter, showSiteNameNextToLogo, showCopyright, showVersion,
        episodesPerPage, socials, appStoreUrl, playStoreUrl, emailLoginEnabled, googleLoginEnabled,
        facebookLoginEnabled, appleLoginEnabled, phoneLoginEnabled, referralEnabled, watermarkEnabled,
        watermarkUrl, watermarkPosition, watermarkOpacity, supportEmail, firebaseApiKey, firebaseAuthDomain,
        firebaseProjectId, firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId,
        firebaseMeasurementId, seoTitle, seoDescription, seoKeywords, robotsTxt, gzipEnabled, pwaEnabled,
        pwaInstallDelay, webpConversionEnabled,
    } = settings;
    return {
        id, siteName, siteUrl, logoUrl, faviconUrl, copyrightText, appVersion, seriesUrlFormat,
        defaultLanguageCode, showSocialsInFooter, showSiteNameNextToLogo, showCopyright, showVersion,
        episodesPerPage, socials, appStoreUrl, playStoreUrl, emailLoginEnabled, googleLoginEnabled,
        facebookLoginEnabled, appleLoginEnabled, phoneLoginEnabled, referralEnabled, watermarkEnabled,
        watermarkUrl, watermarkPosition, watermarkOpacity, supportEmail, firebaseApiKey, firebaseAuthDomain,
        firebaseProjectId, firebaseStorageBucket, firebaseMessagingSenderId, firebaseAppId,
        firebaseMeasurementId, seoTitle, seoDescription, seoKeywords, robotsTxt, gzipEnabled, pwaEnabled,
        pwaInstallDelay, webpConversionEnabled,
    };
}

function publicPaymentSettings(settings: PaymentGatewaySettings): PaymentGatewaySettings {
    const {
        id, stripeEnabled, stripePublishableKey, stripeLogoUrl, paypalEnabled, paypalClientId, paypalLogoUrl,
        razorpayEnabled, razorpayKeyId, razorpayLogoUrl, flutterwaveEnabled, flutterwavePublicKey,
        flutterwaveLogoUrl, googlePayEnabled, googlePlayPackageName, phonepeEnabled, phonepeMerchantId,
        phonepeAppId, phonepeLogoUrl, cashfreeEnabled, cashfreeAppId, cashfreeLogoUrl, payuEnabled,
        payuMerchantKey, payuLogoUrl,
    } = settings;
    return {
        id, stripeEnabled, stripePublishableKey, stripeLogoUrl, paypalEnabled, paypalClientId, paypalLogoUrl,
        razorpayEnabled, razorpayKeyId, razorpayLogoUrl, flutterwaveEnabled, flutterwavePublicKey,
        flutterwaveLogoUrl, googlePayEnabled, googlePlayPackageName, phonepeEnabled, phonepeMerchantId,
        phonepeAppId, phonepeLogoUrl, cashfreeEnabled, cashfreeAppId, cashfreeLogoUrl, payuEnabled,
        payuMerchantKey, payuLogoUrl,
    };
}

function publicPluginsSettings(settings: PluginsSettings): PluginsSettings {
    const {
        gaId, captchaProvider, recaptchaVersion, recaptchaSiteKey, cloudflareSiteKey, hcaptchaSiteKey,
        videoProtectionEnabled, videoRotationPeriod, aiProvider, oneSignalAppId, oneSignalPromptDelay, indexNowEnabled,
    } = settings;
    return {
        gaId, captchaProvider, recaptchaVersion, recaptchaSiteKey, cloudflareSiteKey, hcaptchaSiteKey,
        videoProtectionEnabled, videoRotationPeriod, aiProvider, oneSignalAppId, oneSignalPromptDelay, indexNowEnabled,
    };
}

function publicMobileSettings(settings: import('./types').MobileSettings): import('./types').MobileSettings {
    const publicSettings = { ...settings };
    delete publicSettings.apiKey;
    return publicSettings;
}

function logError(msg: string, error: unknown) {
    if (process.env.NODE_ENV !== 'production') {
        console.error(msg, error);
    } else {
        console.error(`${msg}: ${getErrorMessage(error, 'Error occurred.')}`);
    }
}


export async function isAppInstalled(): Promise<boolean> {
    try {
        const db = await getDb();
        const admin = await db.collection<StringIdDocument>('settings').findOne({ _id: 'admin' });
        return !!admin;
    } catch (e) {
        return false;
    }
}

export async function getDemoModeStatus(): Promise<boolean> {
    return isDemoMode();
}

export async function getAdminProfile(): Promise<AdminProfile | null> {
    try {
        if (!(await canReadPrivateSettings())) return null;
        const db = await getDb();
        const admin = await db.collection<StringIdDocument>('settings').findOne({ _id: 'admin' });
        return admin ? mapDoc(admin) as unknown as AdminProfile : null;
    } catch (e) {
        return null;
    }
}

export async function getAllSeries(lang?: string): Promise<Series[]> {
    try {
        const db = await getDb();
        const query = lang ? { targetLanguages: lang } : {};
        const series = await db.collection('series').find(query).sort({ title: 1 }).toArray();
        return series.map(s => mapDoc(s)) as Series[];
    } catch (e) {
        logError('Failed to fetch series', e);
        return [];
    }
}

export async function getEpisodesForSeries(seriesId: string): Promise<Episode[]> {
    try {
        const db = await getDb();
        const episodes = await db.collection('episodes').find({ seriesId: seriesId }).sort({ episodeInSeason: 1 }).toArray();
        return episodes.map(e => {
            const mapped = mapDoc(e) as Episode;
            return {
                ...mapped,
                mediaAuthorizationRequired: true,
                videoSources: mapped.videoSources?.map(source => ({ ...source, url: '' })),
            };
        });
    } catch (e) {
        logError('Failed to fetch episodes', e);
        return [];
    }
}

export async function getSimilarSeries(series: Series): Promise<Series[]> {
    try {
        const db = await getDb();
        const seriesCollection = db.collection('series');
        const excludeCurrent = { $nor: [getQueryById(series.id)] };
        let similar: WithId<Document>[] = [];
        if (series.genres && series.genres.length > 0) {
            similar = await seriesCollection.find({
                genres: { $in: series.genres },
                ...excludeCurrent,
            }).limit(6).toArray();
        }

        if (similar.length === 0) {
            similar = await seriesCollection.find(excludeCurrent).limit(6).toArray();
        }

        return similar.map(s => mapDoc(s)) as Series[];
    } catch(e) {
        return [];
    }
}

export async function getCoinPacks(): Promise<CoinPack[]> {
    try {
        const db = await getDb();
        const packs = await db.collection('coin-packs').find({}).toArray();
        return packs.map(p => mapDoc(p)) as CoinPack[];
    } catch (e) {
        logError('Failed to fetch coin packs from MongoDB', e);
        return [];
    }
}

export async function getMonetizationSettings(): Promise<MonetizationSettings | null> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'monetization' });
        return settings ? (mapDoc(settings) as unknown as MonetizationSettings) : null;
    } catch (e) {
        return null;
    }
}

export async function getPaymentSettings(): Promise<PaymentGatewaySettings | null> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'payment' });
        if (!settings) return null;
        const mapped = mapDoc(settings) as unknown as PaymentGatewaySettings;
        return (await canReadPrivateSettings()) ? mapped : publicPaymentSettings(mapped);
    } catch (e) {
        return null;
    }
}

export async function getRewardSettings(): Promise<RewardsSettings | null> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'rewards' });
        return settings ? (mapDoc(settings) as unknown as RewardsSettings) : null;
    } catch (e) {
        return null;
    }
}

export async function getRewardTasks(platform: 'website' | 'android' | 'ios' = 'website'): Promise<RewardTask[]> {
    try {
        const db = await getDb();
        const query = platform === 'website'
            ? { $or: [{ platform: 'website' }, { platform: { $exists: false } }] }
            : { platform };
        const tasks = await db.collection('reward-tasks').find(query).toArray();
        return tasks.map(t => mapDoc(t)) as RewardTask[];
    } catch (e) {
        return [];
    }
}

export async function getStorageSettings(): Promise<StorageSettings | null> {
    try {
        if (!(await canReadPrivateSettings())) return null;
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'storage' });
        return settings ? (mapDoc(settings) as unknown as StorageSettings) : null;
    } catch (e) {
        return null;
    }
}

export async function getUserClaims(userId: string): Promise<UserRewardClaim[]> {
    try {
        const db = await getDb();
        const claims = await db.collection('reward-claims').find({ userId }).toArray();
        return claims.map(c => mapDoc(c)) as UserRewardClaim[];
    } catch (e) {
        return [];
    }
}

export async function getUserTransactions(userId: string, limitCount?: number): Promise<CoinTransaction[]> {
    try {
        const db = await getDb();
        let cursor = db.collection('coin-transactions').find({ userId }).sort({ createdAt: -1 });
        if (limitCount) cursor = cursor.limit(limitCount);
        const txs = await cursor.toArray();
        return txs.map(t => ({
            ...mapDoc(t),
            createdAt: t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt)
        })) as CoinTransaction[];
    } catch (e) {
        return [];
    }
}

export async function getUserFavorites(userId: string): Promise<Favorite[]> {
    try {
        const db = await getDb();
        const favs = await db.collection('favorites').find({ userId }).toArray();
        return favs.map(f => mapDoc(f)) as Favorite[];
    } catch (e) {
        return [];
    }
}

export async function getUserHistory(userId: string): Promise<WatchHistory[]> {
    try {
        const db = await getDb();
        const hist = await db.collection('history').find({ userId }).sort({ watchedAt: -1 }).toArray();
        return hist.map(h => mapDoc(h)) as WatchHistory[];
    } catch (e) {
        return [];
    }
}

export async function getPluginsSettings(): Promise<PluginsSettings | null> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'plugins' });
        if (!settings) return null;
        const mapped = mapDoc(settings) as unknown as PluginsSettings;
        return (await canReadPrivateSettings()) ? mapped : publicPluginsSettings(mapped);
    } catch (e) {
        return null;
    }
}

export async function getAllPurchases(): Promise<Purchase[]> {
    try {
        if (!(await canReadPrivateSettings())) return [];
        const db = await getDb();
        const purchases = await db.collection('purchases').find({}).sort({ createdAt: -1 }).toArray();
        return purchases.map(p => mapDoc(p)) as Purchase[];
    } catch (e) {
        return [];
    }
}

export async function getAllSeriesForAdmin(): Promise<Series[]> {
    try {
        const db = await getDb();
        const series = await db.collection('series').find({}).sort({ createdAt: -1 }).toArray();
        return series.map(s => mapDoc(s)) as Series[];
    } catch (e) {
        return [];
    }
}

export async function getSeriesById(id: string): Promise<Series | null> {
    try {
        const db = await getDb();
        const series = await db.collection('series').findOne(getQueryById(id));
        return mapDoc(series) as Series | null;
    } catch (e) {
        return null;
    }
}

export async function getAdSettings(placementId: string = 'main_script_ad'): Promise<Ad | null> {
    try {
        const db = await getDb();
        const ad = await db.collection<StringIdDocument>('ads').findOne({ _id: placementId });
        return ad ? (mapDoc(ad) as unknown as Ad) : null;
    } catch (e) {
        return null;
    }
}

export async function getGeneralSettings(): Promise<GeneralSettings | null> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'general' });
        if (!settings) return null;
        const mapped = mapDoc(settings) as unknown as GeneralSettings;
        return (await canReadPrivateSettings()) ? mapped : publicGeneralSettings(mapped);
    } catch (e) {
        return null;
    }
}

export async function getAllLanguages(): Promise<Language[]> {
    try {
        const db = await getDb();
        const languages = await db.collection('languages').find({}).sort({ name: 1 }).toArray();
        return languages.map(l => mapDoc(l)) as Language[];
    } catch (e) {
        return [];
    }
}

export async function getTranslations(langCode: string): Promise<UITranslations | null> {
    try {
        const db = await getDb();
        const translations = await db.collection<StringIdDocument>('translations').findOne({ _id: langCode });
        return translations ? (mapDoc(translations) as unknown as UITranslations) : null;
    } catch (e) {
        return null;
    }
}

export async function getCustomPages(): Promise<CustomPage[]> {
    try {
        const db = await getDb();
        const pages = await db.collection('pages').find({}).toArray();
        return pages.map(p => mapDoc(p)) as CustomPage[];
    } catch (e) {
        return [];
    }
}

export async function getPageById(id: string): Promise<CustomPage | null> {
    try {
        const db = await getDb();
        const page = await db.collection('pages').findOne(getQueryById(id));
        return page ? mapDoc(page) as unknown as CustomPage : null;
    } catch (e) {
        return null;
    }
}

export async function getContactMessages(): Promise<ContactMessage[]> {
    try {
        if (!(await canReadPrivateSettings())) return [];
        const db = await getDb();
        const messages = await db.collection('contacts').find({}).sort({ createdAt: -1 }).toArray();
        return messages.map(m => mapDoc(m)) as ContactMessage[];
    } catch (e) {
        return [];
    }
}

export async function getContactMessagesCount(): Promise<number> {
    try {
        if (!(await canReadPrivateSettings())) return 0;
        const db = await getDb();
        return await db.collection('contacts').countDocuments({ isRead: false });
    } catch (e) {
        return 0;
    }
}

export async function getReports(): Promise<Report[]> {
    try {
        if (!(await canReadPrivateSettings())) return [];
        const db = await getDb();
        const reports = await db.collection('reports').find({}).sort({ createdAt: -1 }).toArray();
        return reports.map(r => mapDoc(r)) as Report[];
    } catch (e) {
        return [];
    }
}

export async function getCategories(): Promise<Category[]> {
    try {
        const db = await getDb();
        const categories = await db.collection('categories').find({}).toArray();
        return categories.map(c => mapDoc(c)) as Category[];
    } catch (e) {
        return [];
    }
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
    try {
        const db = await getDb();
        const category = await db.collection('categories').findOne({ slug });
        return category ? mapDoc(category) as unknown as Category : null;
    } catch (e) {
        return null;
    }
}

export async function getAllUsersForAdmin(): Promise<Array<Record<string, unknown>>> {
    try {
        if (!(await canReadPrivateSettings())) return [];
        const db = await getDb();
        const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();
        return users.map(u => mapDoc(u));
    } catch (e) {
        return [];
    }
}

export async function getMobileSettings(): Promise<import('./types').MobileSettings | null> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'mobile' });
        if (!settings) return null;
        const mapped = mapDoc(settings) as unknown as import('./types').MobileSettings;
        return (await canReadPrivateSettings()) ? mapped : publicMobileSettings(mapped);
    } catch (e) {
        return null;
    }
}

export async function verifyLicensePeriodically(domain: string): Promise<boolean> {
    try {
        const db = await getDb();
        const settings = await db.collection<StringIdDocument>('settings').findOne({ _id: 'general' });
        
        // If settings doesn't exist, we let the installer run
        if (!settings) {
            return true;
        }

        // If license is explicitly inactive, block
        if (settings.isLicenseActive === false) {
            return false;
        }

        const purchaseCode = settings.purchaseCode;

        // If no purchase code is configured, block
        if (!purchaseCode) {
            return false;
        }

        const lastCheck = settings.lastLicenseCheckAt;
        const oneDay = 24 * 60 * 60 * 1000;

        // If checked within the last 24 hours, return cached status
        if ((typeof lastCheck === 'string' || lastCheck instanceof Date)
            && (Date.now() - new Date(lastCheck).getTime() < oneDay)) {
            return settings.isLicenseActive !== false;
        }

        // Otherwise, make the check request to DevSnaplix API server
        const apiUrl = process.env.DEVSNAPLIX_API_URL || 'https://devsnaplix-api.gadohost.com/api/verify';
        
        console.log(`[License Check] Verifying license for domain ${domain} against ${apiUrl}...`);
        
        try {
            const response = await safeFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    purchaseCode: purchaseCode,
                    domain: domain,
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Verification successful
                await db.collection<StringIdDocument>('settings').updateOne(
                    { _id: 'general' },
                    { 
                        $set: { 
                            isLicenseActive: true, 
                            licenseKey: data.licenseKey,
                            lastLicenseCheckAt: new Date()
                        } 
                    }
                );
                return true;
            } else {
                // Verification failed (code revoked, invalid, or wrong domain)
                console.warn(`[License Check] Verification failed: ${data.error || 'Unknown error'}`);
                await db.collection<StringIdDocument>('settings').updateOne(
                    { _id: 'general' },
                    { 
                        $set: { 
                            isLicenseActive: false,
                            lastLicenseCheckAt: new Date()
                        } 
                    }
                );
                return false;
            }
        } catch (fetchError) {
            console.error('[License Check] Network error calling verification API:', getErrorMessage(fetchError));
            // On network failure, update last check time to retry in 4 hours, and let client pass
            const retryTime = new Date(Date.now() - (24 - 4) * 60 * 60 * 1000); // 4 hours retry window
            await db.collection<StringIdDocument>('settings').updateOne(
                { _id: 'general' },
                { 
                    $set: { 
                        lastLicenseCheckAt: retryTime
                    } 
                }
            );
            return true;
        }
    } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('[License Check] Error in verifyLicensePeriodically:', e);
        } else {
            console.error('[License Check] Error in verifyLicensePeriodically:', getErrorMessage(e, 'Database error'));
        }
        return true; // Fallback in case of database error
    }
}

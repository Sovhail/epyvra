'use client';
import { useEffect } from 'react';
import Script from 'next/script';
import { getPluginsSettings } from '@/lib/data.actions';
import { useUser } from '@/firebase/auth/use-user';

interface OneSignalSdk {
    init(options: {
        appId: string;
        allowLocalhostAsSecureOrigin?: boolean;
        serviceWorkerPath?: string;
        serviceWorkerParam?: { scope: string };
    }): Promise<void>;
    Slidedown?: { promptPush(): Promise<void> };
    login?: (externalId: string) => Promise<void>;
    logout?: () => Promise<void>;
}

declare global {
    interface Window {
        OneSignalDeferred?: Array<(OneSignal: OneSignalSdk) => void | Promise<void>>;
    }
}

export function OneSignalInitializer() {
    const { user } = useUser();
    useEffect(() => {
        getPluginsSettings().then(settings => {
            if (settings?.oneSignalAppId) {
                const appId = settings.oneSignalAppId;
                const delay = (settings.oneSignalPromptDelay || 5) * 1000;

                // Use the current OneSignal Web SDK and isolate its worker from the PWA worker.
                const initialize = async (oneSignal: OneSignalSdk) => {
                    await oneSignal.init({
                        appId: appId,
                        allowLocalhostAsSecureOrigin: true,
                        serviceWorkerPath: 'onesignal/OneSignalSDKWorker.js',
                        serviceWorkerParam: { scope: '/onesignal/' },
                    });

                    // The browser prompt is requested only after the configured delay.
                    setTimeout(() => {
                        void oneSignal.Slidedown?.promptPush();
                    }, delay);
                };

                window.OneSignalDeferred = window.OneSignalDeferred || [];
                window.OneSignalDeferred.push(initialize);
            }
        });
    }, []);

    // Link the browser subscription to the authenticated EPYVRA user. Without
    // this alias, admin notifications targeted by external_id are accepted by
    // OneSignal but have no matching subscription to deliver to.
    useEffect(() => {
        const externalId = user?.uid?.trim();
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (oneSignal) => {
            if (externalId) {
                await oneSignal.login?.(externalId);
            } else {
                await oneSignal.logout?.();
            }
        });
    }, [user?.uid]);

    return (
        <Script 
            src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
            strategy="afterInteractive" 
        />
    );
}

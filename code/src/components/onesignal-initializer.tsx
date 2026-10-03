'use client';
import { useEffect } from 'react';
import Script from 'next/script';
import { getPluginsSettings } from '@/lib/data.actions';

interface OneSignalSdk {
    push(callback: () => void): void;
    init?(options: {
        appId: string;
        allowLocalhostAsSecureOrigin: boolean;
        notifyButton: { enable: boolean };
    }): void;
    showSlidedownPrompt?: () => void;
}

declare global {
    interface Window {
        OneSignal?: OneSignalSdk;
    }
}

export function OneSignalInitializer() {
    useEffect(() => {
        getPluginsSettings().then(settings => {
            if (settings?.oneSignalAppId) {
                const appId = settings.oneSignalAppId;
                const delay = (settings.oneSignalPromptDelay || 5) * 1000;

                // Standard OneSignal Web SDK Initialization
                const oneSignal = window.OneSignal ?? [];
                window.OneSignal = oneSignal;
                oneSignal.push(function() {
                    window.OneSignal?.init?.({
                        appId: appId,
                        allowLocalhostAsSecureOrigin: true,
                        notifyButton: {
                            enable: false,
                        },
                    });

                    // To show prompt after delay on every refresh during testing, 
                    // users usually need to clear their browser cache/site data.
                    setTimeout(() => {
                        oneSignal.showSlidedownPrompt?.();
                    }, delay);
                });
            }
        });
    }, []);

    return (
        <Script 
            src="https://cdn.onesignal.com/sdks/OneSignalSDK.js" 
            strategy="afterInteractive" 
        />
    );
}

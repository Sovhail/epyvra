// OneSignal Web Push worker. It has its own /onesignal/ scope so it does not
// replace the EPYVRA PWA worker registered at /sw.js.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

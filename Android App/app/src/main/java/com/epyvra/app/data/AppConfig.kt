package com.epyvra.app.data

import android.content.Context

object AppConfig {
    // -------------------------------------------------------------------------
    // CONFIGURATION FOR CODECANYON BUYERS:
    // 1. Log into your Admin Panel -> Settings -> Mobile App
    // 2. Copy your API Base URL and API Access Key (or click Generate)
    // 3. (Optional) For Push Notifications, copy your OneSignal App ID from:
    //    Admin Panel -> Settings -> Plugins -> OneSignal App ID
    // -------------------------------------------------------------------------
    const val API_URL = "https://epyvra.com/api/mobile/v1"
    const val API_KEY = "epyvra_apk_dbedfbbbf7baeef759cd0728af1792e8bfd31203171329c1"
    const val ONESIGNAL_APP_ID = "8c1905bc-6bac-496b-8a0a-25475f7123e8"
    const val FIREBASE_WEB_CLIENT_ID = "YOUR_FIREBASE_WEB_CLIENT_ID_HERE"
    // -------------------------------------------------------------------------

    fun init(context: Context) {
        // No-op compatibility wrapper
    }
}

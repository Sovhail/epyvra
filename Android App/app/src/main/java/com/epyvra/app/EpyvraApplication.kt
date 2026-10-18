package com.epyvra.app

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import okhttp3.OkHttpClient
import com.epyvra.app.data.AppConfig
import com.epyvra.app.notifications.OneSignalManager
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.FirebaseApp
import java.util.concurrent.TimeUnit

class EpyvraApplication : Application(), ImageLoaderFactory {

    private lateinit var authStateListener: FirebaseAuth.AuthStateListener

    override fun onCreate() {
        super.onCreate()
        OneSignalManager.initialize(
            context = this,
            appId = AppConfig.ONESIGNAL_APP_ID,
            enableDebugLogging = BuildConfig.DEBUG
        )

        // Firebase's startup provider runs before Application.onCreate on a device.
        // Robolectric tests may intentionally omit it, so only bind identity when
        // the default Firebase app is actually available.
        if (FirebaseApp.getApps(this).isNotEmpty()) {
            authStateListener = FirebaseAuth.AuthStateListener { auth ->
                val user = auth.currentUser
                if (user == null) {
                    OneSignalManager.logout()
                } else {
                    OneSignalManager.login(user.uid)
                    user.email?.let(OneSignalManager::setEmail)
                }
            }
            FirebaseAuth.getInstance().addAuthStateListener(authStateListener)
        }
    }

    override fun newImageLoader(): ImageLoader {
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        return ImageLoader.Builder(this)
            .okHttpClient(okHttpClient)
            .memoryCache {
                MemoryCache.Builder(this)
                    // Use up to 25% of the app's available memory for image caching
                    .maxSizePercent(0.25)
                    .strongReferencesEnabled(true)
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    // 250 MB disk cache for series covers & posters
                    .maxSizeBytes(250L * 1024 * 1024)
                    .build()
            }
            .respectCacheHeaders(false) // Smooth browsing: cache CDN posters without re-validating every scroll
            .crossfade(true)
            .allowHardware(true)
            .build()
    }
}

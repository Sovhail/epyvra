package com.epyvra.app.notifications

import android.content.Context
import com.onesignal.OneSignal
import com.onesignal.debug.LogLevel
import com.onesignal.user.subscriptions.IPushSubscriptionObserver
import com.onesignal.user.subscriptions.PushSubscriptionChangedState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

/** Central entry point for every OneSignal SDK interaction. */
object OneSignalManager {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val initialized = AtomicBoolean(false)
    private val ready = AtomicBoolean(false)
    private val initializationComplete = CompletableDeferred<Unit>()
    private val verificationShown = AtomicBoolean(false)

    @Volatile
    private var registrationListener: (() -> Unit)? = null

    // OneSignal stores observers weakly, so retain this for the process lifetime.
    private val pushSubscriptionObserver = object : IPushSubscriptionObserver {
        override fun onPushSubscriptionChange(state: PushSubscriptionChangedState) {
            notifyWhenRegistered(state.current.id)
        }
    }

    fun initialize(context: Context, appId: String, enableDebugLogging: Boolean) {
        if (appId.isBlank() || !initialized.compareAndSet(false, true)) return

        scope.launch {
            if (enableDebugLogging) {
                OneSignal.Debug.logLevel = LogLevel.VERBOSE
            }
            OneSignal.initWithContext(context.applicationContext, appId)
            OneSignal.User.pushSubscription.addObserver(pushSubscriptionObserver)
            ready.set(true)
            initializationComplete.complete(Unit)
            notifyWhenRegistered(OneSignal.User.pushSubscription.id)
        }
    }

    fun setRegistrationListener(listener: (() -> Unit)?) {
        registrationListener = listener
        if (listener != null && ready.get()) {
            notifyWhenRegistered(OneSignal.User.pushSubscription.id)
        }
    }

    fun requestPushPermission() {
        scope.launch(Dispatchers.Main.immediate) {
            initializationComplete.await()
            // Android permission dialogs must be requested from the main thread.
            OneSignal.Notifications.requestPermission(true)
        }
    }

    fun login(externalId: String) {
        if (externalId.isBlank() || !initialized.get()) return
        scope.launch {
            initializationComplete.await()
            OneSignal.login(externalId)
        }
    }

    fun logout() {
        if (!initialized.get()) return
        scope.launch {
            initializationComplete.await()
            OneSignal.logout()
        }
    }

    fun setEmail(email: String) {
        if (email.isBlank() || !initialized.get()) return
        scope.launch {
            initializationComplete.await()
            OneSignal.User.addEmail(email)
        }
    }

    fun setSmsNumber(number: String) {
        if (number.isBlank() || !initialized.get()) return
        scope.launch {
            initializationComplete.await()
            OneSignal.User.addSms(number)
        }
    }

    fun setTag(key: String, value: String) {
        if (key.isBlank() || !initialized.get()) return
        scope.launch {
            initializationComplete.await()
            OneSignal.User.addTag(key, value)
        }
    }

    private fun notifyWhenRegistered(subscriptionId: String?) {
        val isServerAssigned = !subscriptionId.isNullOrBlank() &&
            !subscriptionId.startsWith("local-")
        if (isServerAssigned && registrationListener != null &&
            verificationShown.compareAndSet(false, true)
        ) {
            registrationListener?.invoke()
        }
    }
}

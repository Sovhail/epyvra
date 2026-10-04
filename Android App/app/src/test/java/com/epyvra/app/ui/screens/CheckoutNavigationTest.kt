package com.epyvra.app.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CheckoutNavigationTest {
    private val checkout = "https://epyvra.com/checkout/session-1"

    @Test
    fun onlyTrustsExactFirstPartyWalletCallbacks() {
        assertEquals(CheckoutResult.SUCCESS, trustedCheckoutResult(checkout, "https://epyvra.com/wallet?status=success&session_id=one"))
        assertEquals(CheckoutResult.CANCELLED, trustedCheckoutResult(checkout, "https://epyvra.com/wallet?status=cancel"))
        assertEquals(CheckoutResult.NONE, trustedCheckoutResult(checkout, "https://evil.example/wallet?status=success"))
        assertEquals(CheckoutResult.NONE, trustedCheckoutResult(checkout, "https://epyvra.com/elsewhere?next=status=success"))
    }

    @Test
    fun blocksCleartextAndUnknownNavigationHosts() {
        assertTrue(isAllowedCheckoutNavigation(checkout, "https://checkout.stripe.com/pay/example"))
        assertTrue(isAllowedCheckoutNavigation(checkout, "https://epyvra.com/wallet"))
        assertFalse(isAllowedCheckoutNavigation(checkout, "http://epyvra.com/wallet"))
        assertFalse(isAllowedCheckoutNavigation(checkout, "https://stripe.com.evil.example/pay"))
    }
}

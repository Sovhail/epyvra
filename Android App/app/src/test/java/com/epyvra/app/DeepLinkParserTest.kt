package com.epyvra.app

import android.net.Uri
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DeepLinkParserTest {
    @Test
    fun acceptsCanonicalCustomAndHttpsLinks() {
        assertEquals("drama_123", parseEpyvraDeepLink(Uri.parse("epyvra://drama/drama_123")))
        assertEquals("drama-123", parseEpyvraDeepLink(Uri.parse("https://epyvra.com/share/drama-123")))
        assertEquals("drama-123", parseEpyvraDeepLink(Uri.parse("https://epyvra.com/share/drama-123/ep/episode-4")))
    }

    @Test
    fun rejectsUnexpectedHostsSchemesAndMalformedIds() {
        assertNull(parseEpyvraDeepLink(Uri.parse("http://epyvra.com/share/drama-123")))
        assertNull(parseEpyvraDeepLink(Uri.parse("https://evil.example/share/drama-123")))
        assertNull(parseEpyvraDeepLink(Uri.parse("snapreels://drama/drama-123")))
        assertNull(parseEpyvraDeepLink(Uri.parse("epyvra://unknown/drama-123")))
        assertNull(parseEpyvraDeepLink(Uri.parse("epyvra://drama/../../admin")))
        assertNull(parseEpyvraDeepLink(Uri.parse("epyvra://drama/")))
    }
}

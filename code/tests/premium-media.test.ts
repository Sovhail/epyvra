import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signBunnyMediaUrl, signBunnyUpstreamUrl, verifyBunnyMediaUrl, type PremiumMediaConfig } from '../src/lib/premium-media';

const config: PremiumMediaConfig = {
  cdnHost: 'media.example.b-cdn.net',
  tokenKey: 'test-only-token-key-that-is-at-least-32-characters',
  ttlSeconds: 300,
  bindToIp: true,
};
const sourceUrl = 'https://media.example.b-cdn.net/premium/episode-abc/master.m3u8';
const base = { sourceUrl, episodeId: 'episode-abc', clientIp: '203.0.113.10', config };

test('premium HLS path token covers the episode directory for manifest and relative segments', () => {
  const signed = signBunnyMediaUrl({ ...base, nowSeconds: 1_000 });
  assert.equal(signed.expiresAt, 1_300);
  assert.equal(signed.contentPath, '/premium/episode-abc/');
  assert.match(signed.url, /^https:\/\/media\.example\.b-cdn\.net\/bcdn_token=/);
  assert.ok(verifyBunnyMediaUrl({ ...base, signedUrl: signed.url, nowSeconds: 1_001 }));
  const segment = new URL('segments/0001.m4s', signed.url);
  assert.match(segment.pathname, /^\/bcdn_token=.*\/premium\/episode-abc\/segments\/0001\.m4s$/);
  assert.ok(verifyBunnyMediaUrl({ ...base, signedUrl: segment.toString(), nowSeconds: 1_001 }));
});

test('expired, modified, wrong-episode, and shared-IP tokens fail validation', () => {
  const signed = signBunnyMediaUrl({ ...base, nowSeconds: 1_000 });
  assert.equal(verifyBunnyMediaUrl({ ...base, signedUrl: signed.url, nowSeconds: 1_300 }), false);
  assert.equal(verifyBunnyMediaUrl({ ...base, signedUrl: signed.url.replace('bcdn_token=', 'bcdn_token=x'), nowSeconds: 1_001 }), false);
  assert.equal(verifyBunnyMediaUrl({ ...base, signedUrl: signed.url, episodeId: 'episode-other', nowSeconds: 1_001 }), false);
  assert.equal(verifyBunnyMediaUrl({ ...base, signedUrl: signed.url, clientIp: '203.0.113.11', nowSeconds: 1_001 }), false);
});

test('premium signing fails closed for missing IP, another host, and a path not bound to the episode', () => {
  assert.throws(() => signBunnyMediaUrl({ ...base, clientIp: undefined }));
  assert.throws(() => signBunnyMediaUrl({ ...base, sourceUrl: 'https://attacker.example/premium/episode-abc/master.m3u8' }));
  assert.throws(() => signBunnyMediaUrl({ ...base, sourceUrl: 'https://media.example.b-cdn.net/premium/other/master.m3u8' }));
});

test('DASH manifests use the same path-token propagation model', () => {
  const signed = signBunnyMediaUrl({
    ...base,
    sourceUrl: 'https://media.example.b-cdn.net/premium/episode-abc/manifest.mpd',
    nowSeconds: 2_000,
  });
  assert.equal(signed.contentPath, '/premium/episode-abc/');
  assert.match(new URL('chunk-1.m4s', signed.url).pathname, /bcdn_token=.*\/premium\/episode-abc\/chunk-1\.m4s$/);
});

test('server-side Bunny proxy signing supports a custom Pull Zone hostname', () => {
  const signed = signBunnyUpstreamUrl({
    sourceUrl: 'https://media.epyvra.test/videos/episode-1.mp4',
    expectedHost: 'media.epyvra.test',
    tokenKey: config.tokenKey,
    ttlSeconds: 120,
    nowSeconds: 1_000,
  });
  assert.match(signed, /^https:\/\/media\.epyvra\.test\/videos\/episode-1\.mp4\?token=HS256-/);
  assert.match(signed, /&expires=1120$/);
});

test('server-side Bunny proxy signing rejects a host mismatch', () => {
  assert.throws(() => signBunnyUpstreamUrl({
    sourceUrl: 'https://attacker.example/videos/episode-1.mp4',
    expectedHost: 'media.epyvra.test',
    tokenKey: config.tokenKey,
  }));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { acquireUploadSlot, stageUpload, UploadError } from '../src/lib/upload-stream';

function upload(size: number, metadata = '') {
  const boundary = 'epyvra-test-boundary';
  async function* chunks() {
    yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="episode.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
    let remaining = size;
    while (remaining > 0) {
      const length = Math.min(remaining, 64 * 1024);
      yield Buffer.alloc(length, 7);
      remaining -= length;
    }
    yield Buffer.from(`\r\n${metadata}--${boundary}--\r\n`);
  }
  const iterator = chunks();
  const body = new ReadableStream<Uint8Array>({ async pull(controller) {
    const item = await iterator.next();
    if (item.done) controller.close(); else controller.enqueue(item.value);
  }, async cancel() { await iterator.return(undefined); } });
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', body, duplex: 'half', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  };
  return new Request('http://localhost/api/upload', init);
}

test('stages a streamed upload without Content-Length and keeps only a bounded signature', async () => {
  const staged = await stageUpload(upload(12 * 1024 * 1024), 13 * 1024 * 1024);
  try {
    assert.equal(staged.size, 12 * 1024 * 1024);
    assert.equal(staged.header.length, 4096);
    assert.equal((await stat(staged.path)).size, staged.size);
  } finally { await staged.cleanup(); }
  await assert.rejects(stat(staged.path));
});

test('streams a 200MB video with a bounded header', async (context) => {
  const startRss = process.memoryUsage().rss;
  let peakRss = startRss;
  const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 5);
  try {
    const size = 200 * 1024 * 1024;
    const staged = await stageUpload(upload(size), size);
    try {
      assert.equal(staged.size, size);
      assert.equal(staged.header.length, 4096);
    } finally { await staged.cleanup(); }
  } finally {
    clearInterval(timer);
    context.diagnostic(`200MB streamed upload: RSS start=${Math.round(startRss / 1048576)}MB, peak=${Math.round(peakRss / 1048576)}MB`);
  }
});

test('rejects oversized file even without a Content-Length header', async () => {
  await assert.rejects(stageUpload(upload(1025), 1024), (error: unknown) => error instanceof UploadError && error.status === 413);
});

test('accepts a file exactly at the size limit', async () => {
  const staged = await stageUpload(upload(1024), 1024);
  try { assert.equal(staged.size, 1024); } finally { await staged.cleanup(); }
});

test('rejects unexpected multipart metadata', async () => {
  const metadata = '--epyvra-test-boundary\r\nContent-Disposition: form-data; name="secret"\r\n\r\nvalue\r\n';
  await assert.rejects(stageUpload(upload(5, metadata), 1024), /Unexpected upload field/);
});

test('preserves payment logo metadata sent after the file', async () => {
  const metadata = '--epyvra-test-boundary\r\nContent-Disposition: form-data; name="type"\r\n\r\npayment-logo\r\n--epyvra-test-boundary\r\nContent-Disposition: form-data; name="identifier"\r\n\r\nstripe\r\n';
  const staged = await stageUpload(upload(5, metadata), 1024);
  try {
    assert.equal(staged.type, 'payment-logo');
    assert.equal(staged.identifier, 'stripe');
  } finally { await staged.cleanup(); }
});

test('rejects malformed multipart body', async () => {
  await assert.rejects(stageUpload(new Request('http://localhost', { method: 'POST', body: 'invalid' }), 1024), UploadError);
});

test('heavy operation slot rejects overlap and can be reused after release', () => {
  const release = acquireUploadSlot();
  assert.ok(release);
  assert.equal(acquireUploadSlot(), null);
  release();
  const next = acquireUploadSlot();
  assert.ok(next);
  next();
});

test('streamed JSON download produces byte chunks accepted by Response', async () => {
  async function* chunks() { yield '{'; yield '"items":['; yield JSON.stringify({ id: 1 }); yield ']}'; }
  const response = new Response(Readable.toWeb(Readable.from(chunks(), { objectMode: false })) as ReadableStream<Uint8Array>);
  assert.deepEqual(await response.json(), { items: [{ id: 1 }] });
});

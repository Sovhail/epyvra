import busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export class UploadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

// A process-wide slot prevents separate admin tabs from staging large files together.
const state = globalThis as typeof globalThis & { epyvraUploadBusy?: boolean };
export function acquireUploadSlot(): (() => void) | null {
  if (state.epyvraUploadBusy) return null;
  state.epyvraUploadBusy = true;
  return () => { state.epyvraUploadBusy = false; };
}

export function logResourceUsage(operation: string, phase: string, bytes?: number) {
  const { rss, heapUsed, external, arrayBuffers } = process.memoryUsage();
  console.info(JSON.stringify({ event: 'resource_usage', operation, phase, bytes, rss, heapUsed, external, arrayBuffers }));
}

export async function stageUpload(request: Request, maxFileBytes: number) {
  if (!request.body) throw new UploadError('No upload body provided.');
  const directory = await mkdtemp(join(tmpdir(), 'epyvra-upload-'));
  const path = join(directory, 'file');
  const cleanup = () => rm(directory, { recursive: true, force: true });
  let name = '';
  let type = '';
  let identifier = '';
  let failure: UploadError | undefined;
  let write: Promise<void> | undefined;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10 * 60 * 1000)]);
  const fail = (message: string, status = 400) => { failure ??= new UploadError(message, status); };
  try {
    const parser = busboy({
      headers: { 'content-type': request.headers.get('content-type') || '' },
      limits: { fileSize: maxFileBytes + 1, files: 1, fields: 2, parts: 4, fieldSize: 256, headerPairs: 50 },
    });
    parser.on('file', (field, file, info) => {
      if (field !== 'file' || !info.filename) { fail('Expected one file field.'); file.resume(); return; }
      name = info.filename;
      file.on('limit', () => fail('File exceeds the configured upload limit.', 413));
      write = pipeline(file, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal });
      // Observe rejection immediately; still await it before cleanup.
      void write.catch(() => {
        fail('Could not stage the uploaded file.');
        parser.destroy(new UploadError('Could not stage the uploaded file.'));
      });
    });
    parser.on('field', (field, value, info) => {
      if (info.valueTruncated || info.nameTruncated) fail('Upload metadata is too large.', 413);
      if (field === 'type') type = value;
      else if (field === 'identifier') identifier = value;
      else fail('Unexpected upload field.');
    });
    parser.on('filesLimit', () => fail('Only one file is accepted.'));
    parser.on('fieldsLimit', () => fail('Too many upload fields.'));
    parser.on('partsLimit', () => fail('Too many upload parts.'));
    let total = 0;
    const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      callback(total > maxFileBytes + 64 * 1024 ? new UploadError('Upload body exceeds limit.', 413) : null, chunk);
    } });
    await pipeline(Readable.fromWeb(request.body as import('node:stream/web').ReadableStream<Uint8Array>), counter, parser, { signal });
    if (write) await write;
    if (failure) throw failure;
    if (!name || !write) throw new UploadError('No file provided.');
    const { size } = await stat(path);
    if (size > maxFileBytes) throw new UploadError('File exceeds the configured upload limit.', 413);
    const handle = await open(path, 'r');
    const header = Buffer.alloc(4096);
    let bytesRead: number;
    try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); }
    finally { await handle.close(); }
    return { path, name, size, type, identifier, header: header.subarray(0, bytesRead), cleanup };
  } catch (error) {
    if (write) await write.catch(() => undefined);
    await cleanup();
    if (error instanceof UploadError) throw error;
    throw new UploadError('Upload was interrupted or malformed.');
  }
}

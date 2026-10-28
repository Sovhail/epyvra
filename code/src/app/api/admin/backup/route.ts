import { Readable } from 'node:stream';
import { verifyAdminSession } from '@/lib/actions/auth';
import { getDb } from '@/lib/mongodb';
import { acquireUploadSlot, logResourceUsage } from '@/lib/upload-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await verifyAdminSession())) return new Response('Unauthorized', { status: 401 });
  // Backup and upload share the heavy-operation slot on a small instance.
  const release = acquireUploadSlot();
  if (!release) return new Response('An upload or backup is already in progress. Please retry.', { status: 429, headers: { 'Retry-After': '5' } });
  try {
    const db = await getDb();
    const collections = db.listCollections({}, { nameOnly: true });
    logResourceUsage('backup', 'start');
    async function* exportDocuments() {
      let bytes = 0;
      try {
        yield '{';
        let firstCollection = true;
        for await (const collection of collections) {
          if (request.signal.aborted) return;
          if (collection.name.startsWith('system.')) continue;
          yield `${firstCollection ? '' : ','}${JSON.stringify(collection.name)}:[`;
          firstCollection = false;
          const cursor = db.collection(collection.name).find({}).batchSize(1);
          try {
            let firstDocument = true;
            for await (const document of cursor) {
              if (request.signal.aborted) return;
              const json = JSON.stringify(document);
              bytes += Buffer.byteLength(json);
              yield `${firstDocument ? '' : ','}${json}`;
              firstDocument = false;
            }
          } finally { await cursor.close(); }
          yield ']';
        }
        yield '}';
      } finally {
        try { await collections.close(); }
        finally {
          release?.();
          logResourceUsage('backup', 'end', bytes);
        }
      }
    }
    return new Response(Readable.toWeb(Readable.from(exportDocuments(), { objectMode: false })) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="epyvra_backup_${new Date().toISOString().slice(0, 10)}.json"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    release();
    return new Response('Database export could not start.', { status: 500 });
  }
}

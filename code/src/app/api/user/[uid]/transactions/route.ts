import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await params;
    await authenticateFirebaseRequest(request, { targetUid: uid, requireMobileApiKey: true });
    const db = await getDb();
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || '100');
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 100;

    const transactions = await db.collection('coin-transactions')
      .find({ userId: uid })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const mapped = transactions.map(t => ({
      id: t._id.toString(),
      userId: t.userId,
      type: t.type,
      amount: t.amount,
      description: t.description,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('API GET /api/user/[uid]/transactions Error:', error);
    }
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

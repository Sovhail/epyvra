import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { performDailyCheckIn } from '@/lib/coin-operations';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await params;

    // Enforce API key and User ID token authorization
    await authenticateFirebaseRequest(request, { targetUid: uid });

    const result = await performDailyCheckIn(uid);

    if (result.success) {
      // Fetch updated user to return latest coins
      const db = await getDb();
      const user = await db.collection<{ _id: string; coins?: number }>('users').findOne({ _id: uid });
      return NextResponse.json({
        success: true,
        reward: result.reward,
        dayNum: result.dayNum,
        coins: user?.coins || 0
      });
    } else {
      return NextResponse.json({ error: result.error || 'Check-in failed' }, { status: 400 });
    }
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('API POST /api/user/[uid]/checkin Error:', error);
    }
    return NextResponse.json({ error: 'Failed to perform daily check-in' }, { status: 500 });
  }
}

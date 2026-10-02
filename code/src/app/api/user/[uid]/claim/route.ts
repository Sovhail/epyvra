import { NextRequest, NextResponse } from 'next/server';
import { claimRewardAction } from '@/lib/actions';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await params;
    await authenticateFirebaseRequest(request, { targetUid: uid, requireMobileApiKey: true });
    const body = await request.json();
    const { taskId } = body;
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }
    const result = await claimRewardAction(uid, taskId, 'android');
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to claim reward' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to claim reward' }, { status: 500 });
  }
}

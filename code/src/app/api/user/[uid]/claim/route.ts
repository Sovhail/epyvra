import { NextRequest, NextResponse } from 'next/server';
import { claimReward, startRewardClaim } from '@/lib/coin-operations';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await params;
    const hasMobileApiKey = Boolean(request.headers.get('x-api-key'));
    await authenticateFirebaseRequest(request, { targetUid: uid, requireMobileApiKey: hasMobileApiKey });
    const body = await request.json();
    const taskId = typeof body.taskId === 'string' ? body.taskId : '';
    const action = body.action === 'start' ? 'start' : 'claim';
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }
    const platform = hasMobileApiKey ? 'android' : 'website';
    const result = action === 'start'
      ? await startRewardClaim(uid, taskId, platform)
      : await claimReward(
          uid,
          taskId,
          platform,
          typeof body.challengeToken === 'string' ? body.challengeToken : '',
        );
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

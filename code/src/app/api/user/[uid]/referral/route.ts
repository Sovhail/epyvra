import { NextRequest, NextResponse } from 'next/server';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';
import { claimReferralCode } from '@/lib/coin-operations';

export async function POST(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await params;
    await authenticateFirebaseRequest(request, { targetUid: uid });
    const body = (await request.json()) as Record<string, unknown>;
    const referralCode = typeof body.referralCode === 'string' ? body.referralCode.trim() : '';
    if (!referralCode) {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 });
    }

    const result = await claimReferralCode(uid, referralCode);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Failed to claim referral code' }, { status: 500 });
  }
}


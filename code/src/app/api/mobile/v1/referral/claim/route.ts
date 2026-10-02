import { NextRequest, NextResponse } from 'next/server';
import { claimReferralCodeAction } from '@/lib/actions';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const identity = await authenticateFirebaseRequest(request, { requireMobileApiKey: true });
        const body = await request.json();
        const { referralCode } = body;

        if (!referralCode) {
            return NextResponse.json({ error: 'Missing required parameter: referralCode' }, { status: 400 });
        }

        const result = await claimReferralCodeAction(identity.uid, referralCode.trim());

        if (result.success) {
            return NextResponse.json(result);
        } else {
            return NextResponse.json({ success: false, error: result.error || 'Failed to claim referral code' }, { status: 400 });
        }
    } catch (error: unknown) {
        if (error instanceof ApiAuthError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to claim referral code' }, { status: 500 });
    }
}

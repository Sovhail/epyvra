import { NextRequest, NextResponse } from 'next/server';
import { verifyAndExecutePurchaseAction } from '@/lib/actions';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const identity = await authenticateFirebaseRequest(request, { requireMobileApiKey: true });
        const body = await request.json();
        const { packId, gateway } = body;
        const purchaseReference = gateway === 'gplay' ? body.purchaseToken : body.sessionId;

        if (!packId || !gateway || !purchaseReference) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const result = await verifyAndExecutePurchaseAction(identity.uid, packId, gateway, purchaseReference);

        if (result.success) {
            return NextResponse.json({ success: true, message: result.message || 'Purchase verified and awarded' });
        } else {
            return NextResponse.json({ success: false, error: result.error || 'Verification failed' }, { status: 400 });
        }
    } catch (error: unknown) {
        if (error instanceof ApiAuthError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to verify purchase' }, { status: 500 });
    }
}

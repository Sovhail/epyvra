import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSessionAction } from '@/lib/actions';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const identity = await authenticateFirebaseRequest(request, { requireMobileApiKey: true });
        const body = await request.json();
        const { packId, gateway } = body;

        if (!packId || !gateway) {
            return NextResponse.json({ error: 'Missing required parameters: packId, gateway' }, { status: 400 });
        }

        const result = await createCheckoutSessionAction(identity.uid, packId, gateway);

        if (result.success && result.url) {
            return NextResponse.json({ success: true, url: result.url });
        } else {
            return NextResponse.json({ success: false, error: result.error || 'Failed to create session' }, { status: 400 });
        }
    } catch (error: unknown) {
        if (error instanceof ApiAuthError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }
}

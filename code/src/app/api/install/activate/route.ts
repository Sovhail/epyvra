import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { authorizeInstall } from '@/lib/install-auth';
import { safeFetch } from '@/lib/safe-fetch';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unknown error';

interface ActivationResponse {
    success?: boolean;
    error?: string;
    licenseKey?: string;
    buyerUsername?: string;
    itemName?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as Record<string, unknown>;
        const { purchaseCode, domain, setupToken } = body;

        const authorization = await authorizeInstall(typeof setupToken === 'string' ? setupToken : '');
        if (!authorization.ok) {
            return NextResponse.json({ success: false, error: authorization.error }, { status: 403 });
        }

        if (typeof purchaseCode !== 'string' || typeof domain !== 'string' || !purchaseCode.trim() || !domain.trim()) {
            return NextResponse.json(
                { success: false, error: 'Missing purchaseCode or domain in request.' },
                { status: 400 }
            );
        }

        // Call the central DevSnaplix API server
        const apiUrl = process.env.DEVSNAPLIX_API_URL || 'https://devsnaplix-api.gadohost.com/api/verify';
        
        console.log(`Verifying license against DevSnaplix API at ${apiUrl}...`);

        let response;
        try {
            response = await safeFetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    purchaseCode: purchaseCode.trim(),
                    domain: domain.trim(),
                }),
            });
        } catch (fetchError: unknown) {
            console.error('Fetch error calling license API:', fetchError);
            return NextResponse.json(
                { success: false, error: `Could not connect to activation server: ${errorMessage(fetchError)}` },
                { status: 502 }
            );
        }

        const data = await response.json() as ActivationResponse;

        if (!response.ok || !data.success) {
            return NextResponse.json(
                { success: false, error: data.error || 'Verification failed.' },
                { status: response.status }
            );
        }

        // Save license information locally to local MongoDB
        try {
            const db = await getDb();
            await db.collection<Record<string, unknown> & { _id: string }>('settings').updateOne(
                { _id: 'general' },
                { 
                    $set: { 
                        isLicenseActive: true, 
                        licenseKey: data.licenseKey,
                        purchaseCode: purchaseCode.trim(),
                        codecanyonUsername: data.buyerUsername || '',
                        activatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
        } catch (dbError: unknown) {
            console.error('Database error saving license:', dbError);
            return NextResponse.json(
                { 
                    success: false, 
                    error: `License verified successfully, but failed to save to local database: ${errorMessage(dbError)}. Please check your MONGODB_URI in the .env file.` 
                },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            licenseKey: data.licenseKey,
            buyerUsername: data.buyerUsername,
            itemName: data.itemName,
            message: 'License activated successfully!'
        });

    } catch (e: unknown) {
        console.error('Error in local activate route:', e);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

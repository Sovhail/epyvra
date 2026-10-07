
import { getDb } from '@/lib/mongodb';
import { notFound } from 'next/navigation';
import { InstallationContent } from '@/components/installation-content';
import type { CustomPage } from '@/lib/types';

async function getInstallationPage() {
    const db = await getDb();
    const page = await db.collection('pages').findOne({ slug: 'installation-setup' });
    if (!page) return null;
    const { _id, ...rest } = page;
    return { id: _id.toString(), ...rest } as CustomPage;
}

export default async function InstallationSetupPage() {
    const page = await getInstallationPage();

    if (!page) {
        notFound();
    }

    return (
        <div className="container mx-auto max-w-5xl py-12">
            <InstallationContent htmlContent={page.content} />
        </div>
    );
}

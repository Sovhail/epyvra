import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { deleteFile } from '@/lib/storage-utils';
import { ApiAuthError, authenticateFirebaseRequest } from '@/lib/api-auth';
import { getFirebaseAdmin } from '@/lib/firebase-admin';
import type { Document } from 'mongodb';

export const dynamic = 'force-dynamic';

type UserDocument = Document & { _id: string; referralCode?: string; publicId?: string };

const mapDoc = (doc: UserDocument | null) => {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { uid: _id.toString(), ...rest };
}

// GET user profile
export async function GET(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const db = await getDb();
    const { uid } = await params; 

    // Verify that the Firebase user owns this profile.
    await authenticateFirebaseRequest(request, { targetUid: uid });

    const users = db.collection<UserDocument>('users');
    const user = await users.findOne({ _id: uid });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Auto-generate referral code if missing
    if (!user.referralCode) {
      const generatedCode = `EPY-${uid}`;
      await users.updateOne(
        { _id: uid },
        { $set: { referralCode: generatedCode, referralCount: 0, referralEarnings: 0 } }
      );
      user.referralCode = generatedCode;
    }

    // Fetch unlocked episodes from MongoDB
    const unlocked = await db.collection('unlocked-episodes').find({ userId: uid }).toArray();
    const unlockedEpisodeIds = unlocked.map(u => u.episodeId);

    // Fetch today's ad watches from MongoDB
    const today = new Date().toISOString().split('T')[0];
    const adWatch = await db.collection('ad-watches').findOne({ userId: uid, date: today });
    const todayAdCount = adWatch ? adWatch.count : 0;

    // Fetch user claims
    const claims = await db.collection('reward-claims').find({ userId: uid }).toArray();
    const tasks = await db.collection('reward-tasks').find({ platform: 'android' }).toArray();
    const tasksMap = new Map(tasks.map(t => [t._id.toString(), t]));
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);

    const claimedTaskIds = claims
      .filter(c => {
        const task = tasksMap.get(c.taskId);
        if (!task) return false;
        if (task.frequency === 'once') return true;
        // daily task - check if claimed today
        const claimedDate = new Date(c.claimedAt);
        return claimedDate >= todayStart;
      })
      .map(c => c.taskId);

    return NextResponse.json({
        ...mapDoc(user),
        unlockedEpisodeIds,
        todayAdCount,
        claimedTaskIds
    });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error(`API GET /api/user Error:`, error);
    }
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// PATCH user profile
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const db = await getDb();
    const { uid } = await params;

    // Verify that the Firebase user owns this profile.
    await authenticateFirebaseRequest(request, { targetUid: uid });

    const body = await request.json();

    const { displayName, photoURL } = body;
    const updateData: Record<string, string> = {};
    if (typeof displayName === 'string' && displayName.trim()) {
      updateData.displayName = displayName.trim().slice(0, 100);
    }
    if (typeof photoURL === 'string') updateData.photoURL = photoURL.slice(0, 2048);
    
    if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const result = await db.collection<UserDocument>('users').updateOne(
      { _id: uid },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'User not found to update' }, { status: 404 });
    }

    return NextResponse.json({ message: 'User updated successfully' });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error(`API PATCH /api/user Error:`, error);
    }
    return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const db = await getDb();
    const { uid } = await params;
    await authenticateFirebaseRequest(request, { targetUid: uid });
    const firebase = await getFirebaseAdmin();
    await firebase.auth().deleteUser(uid);

    const users = db.collection<UserDocument>('users');
    const user = await users.findOne({ _id: uid });
    await deleteFile(user?.photoURL);

    await Promise.all([
      users.deleteOne({ _id: uid }),
      db.collection('favorites').deleteMany({ userId: uid }),
      db.collection('history').deleteMany({ userId: uid }),
      db.collection('likes').deleteMany({ userId: uid }),
      db.collection('unlocked-episodes').deleteMany({ userId: uid }),
      db.collection('reward-claims').deleteMany({ userId: uid }),
      db.collection('coin-transactions').deleteMany({ userId: uid }),
      db.collection('ad-watches').deleteMany({ userId: uid }),
      db.collection('purchases').deleteMany({ userId: uid }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error('API DELETE /api/user/[uid] Error:', error);
    }
    return NextResponse.json({ error: 'Failed to permanently delete account.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawId = decodeURIComponent(id || '').trim();

    if (!rawId) {
      return NextResponse.json({ success: false, error: 'Order identifier is required' }, { status: 400 });
    }

    // ── STRATEGY A: Try Server-Side Firebase Admin SDK First (Bypasses Client Security Rules) ──
    try {
      const colAdmin = adminDb.collection('orders');

      // 1. Direct doc ID
      if (!rawId.includes(' ')) {
        const docRef = colAdmin.doc(rawId);
        const snap = await docRef.get();
        if (snap.exists) {
          return NextResponse.json({ success: true, order: { id: snap.id, ...snap.data() } });
        }
      }

      // 2. Numeric infoNumber
      const numVal = Number(rawId);
      if (!isNaN(numVal) && numVal > 0) {
        const snapNum = await colAdmin.where('infoNumber', '==', numVal).get();
        if (!snapNum.empty) {
          const docSnap = snapNum.docs[0];
          return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
        }
      }

      // 3. String infoNumber
      const snapStr = await colAdmin.where('infoNumber', '==', rawId).get();
      if (!snapStr.empty) {
        const docSnap = snapStr.docs[0];
        return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
      }

      // 4. Phone number
      const snapPhone = await colAdmin.where('customerPhone', '==', rawId).get();
      if (!snapPhone.empty) {
        const docSnap = snapPhone.docs[0];
        return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
      }

      // 5. Clean phone digits
      const cleanDigits = rawId.replace(/[^0-9]/g, '');
      if (cleanDigits.length >= 7) {
        const snapAll = await colAdmin.get();
        for (const docSnap of snapAll.docs) {
          const data = docSnap.data();
          const pClean = (data.customerPhone || '').replace(/[^0-9]/g, '');
          const infoStr = String(data.infoNumber || '').replace(/[^0-9]/g, '');
          if (pClean && (pClean.endsWith(cleanDigits) || cleanDigits.endsWith(pClean))) {
            return NextResponse.json({ success: true, order: { id: docSnap.id, ...data } });
          }
          if (infoStr && infoStr === cleanDigits) {
            return NextResponse.json({ success: true, order: { id: docSnap.id, ...data } });
          }
        }
      }
    } catch (adminErr: any) {
      console.warn("Firebase Admin SDK query failed, attempting Client Firestore SDK fallback:", adminErr?.message || adminErr);
    }

    // ── STRATEGY B: Fallback to Client Firestore Web SDK ──
    const colRef = collection(db, 'orders');

    // 1. Direct doc ID
    if (!rawId.includes(' ')) {
      try {
        const docRef = doc(db, 'orders', rawId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
        }
      } catch {}
    }

    // 2. Numeric infoNumber
    const numVal = Number(rawId);
    if (!isNaN(numVal) && numVal > 0) {
      try {
        const qNum = query(colRef, where('infoNumber', '==', numVal));
        const snapNum = await getDocs(qNum);
        if (!snapNum.empty) {
          const docSnap = snapNum.docs[0];
          return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
        }
      } catch (err) {
        console.warn("Client SDK numeric infoNumber query failed:", err);
      }
    }

    // 3. String infoNumber
    try {
      const qStr = query(colRef, where('infoNumber', '==', rawId));
      const snapStr = await getDocs(qStr);
      if (!snapStr.empty) {
        const docSnap = snapStr.docs[0];
        return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
      }
    } catch (err) {
      console.warn("Client SDK string infoNumber query failed:", err);
    }

    // 4. Customer phone
    try {
      const qPhone = query(colRef, where('customerPhone', '==', rawId));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        const docSnap = snapPhone.docs[0];
        return NextResponse.json({ success: true, order: { id: docSnap.id, ...docSnap.data() } });
      }
    } catch (err) {
      console.warn("Client SDK customerPhone query failed:", err);
    }

    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error fetching public order:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rawId = decodeURIComponent(id || '').trim();
    const body = await request.json();
    const { players, customerNotes, orderId } = body;
    const targetId = orderId || rawId;

    if (!targetId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    let finalDocId = targetId;

    // Try Server-Side Admin SDK Update First
    try {
      const colAdmin = adminDb.collection('orders');
      let docRef = colAdmin.doc(finalDocId);
      let snap = await docRef.get();

      if (!snap.exists) {
        const numVal = Number(targetId);
        if (!isNaN(numVal) && numVal > 0) {
          const res = await colAdmin.where('infoNumber', '==', numVal).get();
          if (!res.empty) {
            docRef = res.docs[0].ref;
            finalDocId = res.docs[0].id;
            snap = res.docs[0];
          }
        }
      }

      if (snap.exists) {
        await docRef.update({
          customerRosterDraft: players || [],
          rosterStatus: 'pending_admin_approval',
          customerSubmittedAt: new Date(),
          customerNotes: (customerNotes || '').trim(),
          updatedAt: new Date(),
        });
        return NextResponse.json({ success: true, message: 'Roster submitted successfully', orderId: finalDocId });
      }
    } catch (adminErr) {
      console.warn("Admin SDK update failed, falling back to Client SDK:", adminErr);
    }

    // Client SDK Fallback
    const targetDocRef = doc(db, 'orders', finalDocId);
    await updateDoc(targetDocRef, {
      customerRosterDraft: players || [],
      rosterStatus: 'pending_admin_approval',
      customerSubmittedAt: serverTimestamp(),
      customerNotes: (customerNotes || '').trim(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      message: 'Roster submitted successfully',
      orderId: finalDocId,
    });
  } catch (error: any) {
    console.error('Error updating public customer roster:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to submit roster' },
      { status: 500 }
    );
  }
}

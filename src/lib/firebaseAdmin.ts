import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(serviceAccountKey);
      initializeApp({
        credential: cert(parsed),
      });
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", err);
      initializeApp({ projectId: 'printmartassistant' });
    }
  } else if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId: 'printmartassistant',
        clientEmail: clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    initializeApp({
      projectId: 'printmartassistant',
    });
  }
}

export const adminDb = getFirestore();

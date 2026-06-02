import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, googleProvider, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, Timestamp } from 'firebase/firestore';

export type UserRole = 'pending' | 'worker' | 'admin';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  designation?: string;
  workMode?: 'office' | 'remote';
  createdAt: Timestamp;
}

export const signInWithGoogle = async () => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('last_welcome_popup_date');
    }
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Check if user exists in Firestore
    const userDocRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // First time login, create with 'pending' role
      const newUser: AppUser = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        role: 'pending',
        workMode: 'office',
        createdAt: serverTimestamp() as unknown as Timestamp,
      };
      await setDoc(userDocRef, newUser);
    }

    return user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('last_welcome_popup_date');
    }
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

export const listenToAuthChanges = (callback: (user: User | null, appUser: AppUser | null) => void) => {
  let unsubscribeSnapshot: (() => void) | null = null;

  const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }

    if (user) {
      const userDocRef = doc(db, 'users', user.uid);

      // Use onSnapshot for real-time updates!
      unsubscribeSnapshot = onSnapshot(userDocRef, async (userDoc) => {
        if (userDoc.exists()) {
          const data = userDoc.data() as AppUser;
          // Trim whitespace in case of manual typo in console e.g. "admin "
          if (data.role) data.role = data.role.trim() as UserRole;
          callback(user, data);
        } else {
          // User exists in Auth but not in Firestore
          const newUser: AppUser = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            role: 'pending',
            workMode: 'office',
            createdAt: serverTimestamp() as unknown as Timestamp,
          };
          try {
            await setDoc(userDocRef, newUser);
            // Don't need to callback here because setDoc will trigger the onSnapshot again
          } catch (error) {
            console.error("Failed to create missing user document:", error);
            callback(user, null);
          }
        }
      });
    } else {
      callback(null, null);
    }
  });

  return () => {
    unsubscribeAuth();
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
    }
  };
};

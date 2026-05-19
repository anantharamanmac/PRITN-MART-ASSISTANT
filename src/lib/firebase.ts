import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBK7OlM8CjfImB4jbwO3IHlzbFsR54M1QI",
  authDomain: "printmartassistant.firebaseapp.com",
  projectId: "printmartassistant",
  storageBucket: "printmartassistant.firebasestorage.app",
  messagingSenderId: "24837979635",
  appId: "1:24837979635:web:e061a5a03a590979852686",
  measurementId: "G-3MYYPR4GPV"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export default app;

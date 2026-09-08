/**
 * Face ID Engine - Deep Neural Network Biometrics & Face Recognition
 * Powered by open-source @vladmandic/face-api (ResNet-34 FaceNet + SSD MobileNet V1)
 * 100% Free & Local in Browser WebGL (0 API Cost)
 */

import { db } from './firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
} from 'firebase/firestore';

export interface EnrolledFace {
  id: string;
  name: string;
  employeeId?: string;
  role?: string;
  embedding: number[]; // 128-dimensional FaceNet descriptor
  photoDataUrl: string;
  approvalStatus: 'pending' | 'approved';
  createdAt: string;
}

export interface FaceDetectionResult {
  detected: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
  landmarks?: { x: number; y: number }[];
  match?: EnrolledFace;
  confidenceScore: number; // 0 to 100
  distance: number; // Euclidean distance L2
}

const STORAGE_KEY = 'printmart_face_id_enrolled_profiles_v3';
const COLLECTION_NAME = 'face_profiles';
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

let faceapiModule: typeof import('@vladmandic/face-api') | null = null;
let isModelLoaded = false;
let modelLoadingPromise: Promise<boolean> | null = null;

/**
 * Helper to compress image data URL to lightweight thumbnail (<15 KB)
 * Prevents Firestore document size limit (1MB) errors on high-res phone cameras.
 */
function compressPhotoDataUrl(source: HTMLCanvasElement | HTMLVideoElement, box: { x: number; y: number; width: number; height: number }): string {
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = 90;
  cropCanvas.height = 90;
  const cropCtx = cropCanvas.getContext('2d');

  if (cropCtx) {
    const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    const padX = box.width * 0.15;
    const padY = box.height * 0.15;

    const cropX = Math.max(0, box.x - padX);
    const cropY = Math.max(0, box.y - padY);
    const cropW = Math.min(srcW - cropX, box.width + padX * 2);
    const cropH = Math.min(srcH - cropY, box.height + padY * 2);

    cropCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, 90, 90);
    return cropCanvas.toDataURL('image/jpeg', 0.5);
  }
  return '';
}

/**
 * Dynamically initializes and loads @vladmandic/face-api neural network models into browser WebGL.
 */
export async function loadFaceApiModels(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isModelLoaded && faceapiModule) return true;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      if (!faceapiModule) {
        faceapiModule = await import('@vladmandic/face-api');
      }
      const faceapi = faceapiModule;

      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_URL),
      ]);

      isModelLoaded = true;
      console.log('✓ @vladmandic/face-api neural models loaded into WebGL');
      return true;
    } catch (err) {
      console.error('Failed to load face-api neural models from CDN, trying fallback...', err);
      try {
        if (!faceapiModule) {
          faceapiModule = await import('@vladmandic/face-api');
        }
        const faceapi = faceapiModule;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(CDN_MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_URL),
        ]);
        isModelLoaded = true;
        return true;
      } catch (fallbackErr) {
        console.error('Failed fallback model load', fallbackErr);
        return false;
      }
    }
  })();

  return modelLoadingPromise;
}

export function isNeuralModelReady(): boolean {
  return isModelLoaded;
}

/**
 * Detects a face and extracts 128-dimensional ResNet neural embedding vector.
 */
export async function extractFaceNeuralDescriptor(
  sourceCanvas: HTMLCanvasElement | HTMLVideoElement
): Promise<{
  descriptor: number[];
  boundingBox: { x: number; y: number; width: number; height: number };
  landmarks: { x: number; y: number }[];
  previewUrl: string;
} | null> {
  if (typeof window === 'undefined') return null;
  const ready = await loadFaceApiModels();
  if (!ready || !faceapiModule) return null;

  try {
    const faceapi = faceapiModule;
    const detection = await faceapi
      .detectSingleFace(sourceCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const box = detection.detection.box;
    const landmarks = detection.landmarks.positions.map(p => ({ x: p.x, y: p.y }));
    const descriptor = Array.from(detection.descriptor);
    const previewUrl = compressPhotoDataUrl(sourceCanvas, box);

    return {
      descriptor,
      boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      landmarks,
      previewUrl,
    };
  } catch (err) {
    console.error('Error during neural face detection', err);
    return null;
  }
}

/**
 * Calculates Euclidean Distance L2 between two 128D FaceNet descriptors
 */
export function calculateEuclideanDistance(descriptor1: number[], descriptor2: number[]): number {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) return 999;
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Compares live 128D face descriptor against APPROVED enrolled faces database
 */
export function recognizeFaceNeural(
  liveDescriptor: number[] | null,
  enrolledFaces: EnrolledFace[],
  thresholdPercent: number = 75
): FaceDetectionResult {
  if (!liveDescriptor || liveDescriptor.length === 0) {
    return { detected: false, confidenceScore: 0, distance: 999 };
  }

  // Filter ONLY approved faces for live attendance recognition
  const approvedFaces = enrolledFaces.filter(f => f.approvalStatus === 'approved' || !f.approvalStatus);

  if (!approvedFaces || approvedFaces.length === 0) {
    return { detected: true, confidenceScore: 0, distance: 999 };
  }

  let bestMatch: EnrolledFace | undefined = undefined;
  let minDistance = 999;

  for (const face of approvedFaces) {
    const dist = calculateEuclideanDistance(liveDescriptor, face.embedding);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = face;
    }
  }

  const maxMatchDistance = 0.65;
  let confidenceScore = 0;

  if (minDistance < maxMatchDistance) {
    const normDist = minDistance / maxMatchDistance;
    confidenceScore = Math.min(100, Math.max(0, Math.round((1 - Math.pow(normDist, 1.4)) * 100)));
  }

  const isMatched = confidenceScore >= thresholdPercent ? bestMatch : undefined;

  return {
    detected: true,
    match: isMatched,
    confidenceScore,
    distance: Number(minDistance.toFixed(4)),
  };
}

/**
 * Local Storage Synchronous Cache Helper
 */
export function getEnrolledFacesLocal(): EnrolledFace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read enrolled faces local cache', err);
    return [];
  }
}

export function saveEnrolledFacesLocal(faces: EnrolledFace[]): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(faces));
    } catch (err) {
      console.error('Failed to save faces local cache', err);
    }
  }
}

/**
 * Real-time Firebase Firestore Sync for Enrolled Faces across all devices
 */
export function listenToEnrolledFaces(onUpdate: (faces: EnrolledFace[]) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const localFaces = getEnrolledFacesLocal();
  if (localFaces.length > 0) {
    onUpdate(localFaces);
  }

  try {
    const colRef = collection(db, COLLECTION_NAME);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const faces: EnrolledFace[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as EnrolledFace;
          // Default legacy items to approved
          if (!data.approvalStatus) data.approvalStatus = 'approved';
          faces.push(data);
        });

        faces.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        saveEnrolledFacesLocal(faces);
        onUpdate(faces);
      },
      (err) => {
        console.error('Firestore listen error for face_profiles', err);
        onUpdate(getEnrolledFacesLocal());
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error('Failed to attach Firestore listener', err);
    onUpdate(getEnrolledFacesLocal());
    return () => {};
  }
}

/**
 * Saves a new enrolled face profile to Firebase Firestore & local storage
 */
export async function saveEnrolledFace(
  face: Omit<EnrolledFace, 'id' | 'createdAt' | 'approvalStatus'>,
  autoApprove: boolean = true
): Promise<EnrolledFace> {
  const newProfile: EnrolledFace = {
    ...face,
    id: `face_neural_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    approvalStatus: autoApprove ? 'approved' : 'pending',
    createdAt: new Date().toISOString(),
  };

  // 1. Update Local Cache
  const existingLocal = getEnrolledFacesLocal();
  const updatedLocal = [newProfile, ...existingLocal];
  saveEnrolledFacesLocal(updatedLocal);

  // 2. Sync to Firebase Firestore
  try {
    const docRef = doc(db, COLLECTION_NAME, newProfile.id);
    await setDoc(docRef, newProfile);
    console.log('✓ Face profile saved to Firestore:', newProfile.id);
  } catch (err) {
    console.error('Firestore upload error for face profile:', err);
    throw err;
  }

  return newProfile;
}

/**
 * Approves a pending face profile (Admin action)
 */
export async function approveEnrolledFace(id: string): Promise<void> {
  // Update Local Cache
  const existing = getEnrolledFacesLocal();
  const updated = existing.map(f => f.id === id ? { ...f, approvalStatus: 'approved' as const } : f);
  saveEnrolledFacesLocal(updated);

  // Update Firestore Cloud
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, { approvalStatus: 'approved' });
    console.log('✓ Approved face profile:', id);
  } catch (err) {
    console.error('Failed to approve face profile in Firestore', err);
    throw err;
  }
}

/**
 * Deletes/Rejects an enrolled face profile
 */
export async function deleteEnrolledFace(id: string): Promise<void> {
  const existing = getEnrolledFacesLocal();
  saveEnrolledFacesLocal(existing.filter(f => f.id !== id));

  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete face from Firestore', err);
  }
}

/**
 * Clears all enrolled face profiles
 */
export async function clearAllEnrolledFaces(): Promise<void> {
  const existing = getEnrolledFacesLocal();
  saveEnrolledFacesLocal([]);

  try {
    await Promise.all(existing.map(f => deleteDoc(doc(db, COLLECTION_NAME, f.id))));
  } catch (err) {
    console.error('Failed to clear faces from Firestore', err);
  }
}

/**
 * WebAuthn (Device Native Biometrics) Helpers
 */
export async function isWebAuthnSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerWebAuthnBiometrics(userName: string): Promise<boolean> {
  if (!window.PublicKeyCredential) throw new Error('WebAuthn biometrics not supported.');

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  window.crypto.getRandomValues(userId);

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { name: 'Print Mart Assistant', id: window.location.hostname },
    user: { id: userId, name: userName, displayName: userName },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
    timeout: 60000,
  };

  const credential = await navigator.credentials.create({
    publicKey: publicKeyCredentialCreationOptions,
  });

  if (credential) {
    localStorage.setItem('printmart_webauthn_registered', 'true');
    localStorage.setItem('printmart_webauthn_user', userName);
    return true;
  }
  return false;
}

export async function verifyWebAuthnBiometrics(): Promise<boolean> {
  if (!window.PublicKeyCredential) throw new Error('WebAuthn biometrics not supported.');

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    userVerification: 'required',
    timeout: 60000,
  };

  const assertion = await navigator.credentials.get({
    publicKey: publicKeyCredentialRequestOptions,
  });

  return !!assertion;
}

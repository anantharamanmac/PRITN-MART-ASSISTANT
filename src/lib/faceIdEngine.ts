/**
 * Face ID Engine - Deep Neural Network Biometrics & Face Recognition
 * Powered by open-source @vladmandic/face-api (ResNet-34 FaceNet + SSD MobileNet V1)
 * 100% Free & Local in Browser WebGL (0 API Cost)
 */

export interface EnrolledFace {
  id: string;
  name: string;
  employeeId?: string;
  role?: string;
  embedding: number[]; // 128-dimensional FaceNet descriptor
  photoDataUrl: string;
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

const STORAGE_KEY = 'printmart_face_id_enrolled_profiles_v2';
const CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

let faceapiModule: typeof import('@vladmandic/face-api') | null = null;
let isModelLoaded = false;
let modelLoadingPromise: Promise<boolean> | null = null;

/**
 * Dynamically initializes and loads @vladmandic/face-api neural network models into browser WebGL.
 * Safe for Next.js SSR / Static Generation.
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

      // Load SSD MobileNet V1, 68 Landmark Net, and ResNet Face Recognition Net
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(CDN_MODEL_URL),
      ]);

      isModelLoaded = true;
      console.log('✓ @vladmandic/face-api neural models loaded successfully into WebGL');
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
 * Returns null if NO face is detected in the input canvas/video element.
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
    // Detect single face with 68 landmarks & 128D neural descriptor
    const detection = await faceapi
      .detectSingleFace(sourceCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const box = detection.detection.box;
    const landmarks = detection.landmarks.positions.map(p => ({ x: p.x, y: p.y }));
    const descriptor = Array.from(detection.descriptor);

    // Create cropped preview snapshot
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 150;
    cropCanvas.height = 150;
    const cropCtx = cropCanvas.getContext('2d');

    if (cropCtx) {
      const srcW = sourceCanvas instanceof HTMLVideoElement ? sourceCanvas.videoWidth : sourceCanvas.width;
      const srcH = sourceCanvas instanceof HTMLVideoElement ? sourceCanvas.videoHeight : sourceCanvas.height;

      const padX = box.width * 0.15;
      const padY = box.height * 0.15;

      const cropX = Math.max(0, box.x - padX);
      const cropY = Math.max(0, box.y - padY);
      const cropW = Math.min(srcW - cropX, box.width + padX * 2);
      const cropH = Math.min(srcH - cropY, box.height + padY * 2);

      cropCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, 150, 150);
    }

    return {
      descriptor,
      boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      landmarks,
      previewUrl: cropCanvas.toDataURL('image/jpeg', 0.85),
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
 * Compares live 128D face descriptor against enrolled face database using FaceNet L2 distance
 */
export function recognizeFaceNeural(
  liveDescriptor: number[] | null,
  enrolledFaces: EnrolledFace[],
  thresholdPercent: number = 75
): FaceDetectionResult {
  if (!liveDescriptor || liveDescriptor.length === 0) {
    return { detected: false, confidenceScore: 0, distance: 999 };
  }

  if (!enrolledFaces || enrolledFaces.length === 0) {
    return { detected: true, confidenceScore: 0, distance: 999 };
  }

  let bestMatch: EnrolledFace | undefined = undefined;
  let minDistance = 999;

  for (const face of enrolledFaces) {
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
 * LocalStorage helpers for enrolled neural faces
 */
export function getEnrolledFaces(): EnrolledFace[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read enrolled faces', err);
    return [];
  }
}

export function saveEnrolledFace(face: Omit<EnrolledFace, 'id' | 'createdAt'>): EnrolledFace {
  const existing = getEnrolledFaces();
  const newProfile: EnrolledFace = {
    ...face,
    id: `face_neural_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  const updated = [newProfile, ...existing];
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return newProfile;
}

export function deleteEnrolledFace(id: string): void {
  const existing = getEnrolledFaces();
  const updated = existing.filter(f => f.id !== id);
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
}

export function clearAllEnrolledFaces(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
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

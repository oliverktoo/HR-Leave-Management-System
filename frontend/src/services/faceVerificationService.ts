// faceVerificationService — loads face-api.js models from CDN and provides
// face descriptor extraction + euclidean-distance-based verification.

import * as faceapi from 'face-api.js';

const WEIGHTS_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;

export function loadModels(): Promise<void> {
  if (modelsLoaded) return Promise.resolve();
  if (modelsLoading) return modelsLoading;

  modelsLoading = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(WEIGHTS_URL),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(WEIGHTS_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(WEIGHTS_URL),
  ]).then(() => {
    modelsLoaded = true;
  });

  return modelsLoading;
}

export function descriptorToArray(d: Float32Array): number[] {
  return Array.from(d);
}

export function arrayToDescriptor(a: number[]): Float32Array {
  return new Float32Array(a);
}

export async function extractDescriptorFromDataUrl(
  dataUrl: string
): Promise<Float32Array | null> {
  await loadModels();

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const detection = await faceapi
          .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks(true)
          .withFaceDescriptor();
        resolve(detection?.descriptor ?? null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function euclideanDistance(
  a: number[] | Float32Array,
  b: number[] | Float32Array
): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export type VerificationStatus =
  | 'verified'
  | 'uncertain'
  | 'no_face'
  | 'no_reference'
  | 'flagged';

export interface VerificationResult {
  status: VerificationStatus;
  score: number | null;
  message: string;
  autoVerified: boolean;
}

export async function verifyFace(
  dataUrl: string,
  storedDescriptor: number[] | null
): Promise<VerificationResult> {
  if (storedDescriptor === null) {
    return {
      status: 'no_reference',
      score: null,
      message:
        'No face registered. Please register your face first to enable auto-verification.',
      autoVerified: false,
    };
  }

  const descriptor = await extractDescriptorFromDataUrl(dataUrl);

  if (!descriptor) {
    return {
      status: 'no_face',
      score: null,
      message: 'No face detected in photo. Ensure your face is clearly visible.',
      autoVerified: false,
    };
  }

  const score = euclideanDistance(descriptor, storedDescriptor);

  if (score < 0.4) {
    return {
      status: 'verified',
      score,
      message: 'Identity verified \u2713',
      autoVerified: true,
    };
  }

  if (score < 0.6) {
    return {
      status: 'uncertain',
      score,
      message: 'Low confidence \u2014 will be reviewed by HR',
      autoVerified: false,
    };
  }

  return {
    status: 'flagged',
    score,
    message: 'Face does not match records \u2014 flagged for HR review',
    autoVerified: false,
  };
}

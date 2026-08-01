import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface PricingRates {
  materials: Record<string, number>; // e.g. { 'Saleena': 250, 'Dot Knit': 270, ... }
  sleeves: Record<string, number>;   // e.g. { 'full': 30, 'half': 0, 'sleeveless': -10 }
  necks: Record<string, number>;     // e.g. { 'Round Neck': 0, 'V-Neck': 10, 'Collar / Polo': 40, 'Chinese Collar': 35, 'Custom / Other': 0 }
  shortsRate: number;                // e.g. 120 (Rate added if shorts enabled)
  updatedAt?: string;
}

export const DEFAULT_PRICING_RATES: PricingRates = {
  materials: {
    'SALEENA': 250,
    'SUPERPOLY': 240,
    'LYCRA 2 WAY': 280,
    'LYCRA 4 WAY': 320,
    'PP': 260,
    'DOTKNIT 140': 270,
    'DOTKNIT 180': 290,
    'HONEYCOMB': 300,
    'BOXNET': 310,
    'JAGUARD': 320,
    'Custom / Other': 250,
  },
  sleeves: {
    'full': 30,       // Full Sleeve extra charge per piece
    'half': 0,        // Base rate
    'sleeveless': -10 // Discount per piece
  },
  necks: {
    'Round Neck': 0,
    'V-Neck': 10,
    'Collar / Polo': 40,
    'Chinese Collar': 35,
    'Custom / Other': 0,
  },
  shortsRate: 120, // Add-on per piece when shorts included
};

const PRICING_DOC_PATH = 'pricing_settings/rates';

/**
 * Fetch Pricing Rates from Firestore or return Defaults
 */
export async function getPricingRates(): Promise<PricingRates> {
  try {
    const docRef = doc(db, PRICING_DOC_PATH);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as Partial<PricingRates>;
      return {
        materials: { ...DEFAULT_PRICING_RATES.materials, ...(data.materials || {}) },
        sleeves: { ...DEFAULT_PRICING_RATES.sleeves, ...(data.sleeves || {}) },
        necks: { ...DEFAULT_PRICING_RATES.necks, ...(data.necks || {}) },
        shortsRate: typeof data.shortsRate === 'number' ? data.shortsRate : DEFAULT_PRICING_RATES.shortsRate,
        updatedAt: data.updatedAt,
      };
    }
  } catch (err) {
    console.error('Error fetching pricing rates from Firestore:', err);
  }

  return DEFAULT_PRICING_RATES;
}

/**
 * Save Pricing Rates to Firestore
 */
export async function savePricingRates(rates: PricingRates): Promise<void> {
  try {
    const docRef = doc(db, PRICING_DOC_PATH);
    const updatedRates: PricingRates = {
      ...rates,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(docRef, updatedRates, { merge: true });
  } catch (err) {
    console.error('Error saving pricing rates to Firestore:', err);
    throw err;
  }
}

/**
 * Helper to calculate per-piece unit rate & total amount based on selection
 */
export function calculateOrderPrice(params: {
  clothType: string;
  sleeveType: 'full' | 'half' | 'sleeveless' | string;
  neckType: string;
  hasShorts: boolean;
  pieces: number;
  rates: PricingRates;
}) {
  const { clothType, sleeveType, neckType, hasShorts, pieces, rates } = params;

  // Material Base Rate
  const materialRate = rates.materials[clothType] ?? rates.materials['Custom / Other'] ?? 250;

  // Sleeve Rate Adjustment
  const sleeveKey = (sleeveType || 'half').toLowerCase();
  const sleeveRate = rates.sleeves[sleeveKey] ?? 0;

  // Neck Rate Adjustment
  const neckRate = rates.necks[neckType] ?? rates.necks['Custom / Other'] ?? 0;

  // Shorts Rate
  const shortsRate = hasShorts ? (rates.shortsRate || 0) : 0;

  // Unit Rate per piece
  const unitRate = materialRate + sleeveRate + neckRate + shortsRate;

  // Total Amount
  const totalAmount = Math.max(0, unitRate * (pieces || 1));

  return {
    materialRate,
    sleeveRate,
    neckRate,
    shortsRate,
    unitRate,
    totalAmount,
  };
}

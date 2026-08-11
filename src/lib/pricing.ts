import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface PricingRates {
  materials: Record<string, number>; // e.g. { 'Saleena': 250, 'Dot Knit': 270, ... }
  sleeves: Record<string, number>;   // e.g. { 'full': 30, 'half': 0, 'sleeveless': -10 }
  necks: Record<string, number>;     // e.g. { 'Round Neck': 0, 'V-Neck': 10, 'Collar / Polo': 40, 'Chinese Collar': 35, 'Custom / Other': 0 }
  shortsRate: number;                // e.g. 120 (Rate added if shorts enabled)
  shortsMaterials?: Record<string, number>; // e.g. { 'SALEENA': 120, 'SUPERPOLY': 120, ... }
  dtfMaterials?: Record<string, number>;    // Jersey DTF material rates
  dtfRates?: Record<string, number>;        // Placement and size modifiers: front, back, front and back, a4 size, a3 size
  updatedAt?: string;
}

export const DEFAULT_PRICING_RATES: PricingRates = {
  materials: {
    'SALEENA': 250,
    'SUPERPOLY': 240,
    'LYCRA 2 WAY': 280,
    'LYCRA 4 WAY': 320,
    'PP': 260,
    'POPNIT': 260,
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
  shortsMaterials: {
    'SALEENA': 120,
    'SUPERPOLY': 120,
    'LYCRA 2 WAY': 120,
    'LYCRA 4 WAY': 120,
    'PP': 120,
    'POPNIT': 120,
    'DOTKNIT 140': 120,
    'DOTKNIT 180': 120,
    'HONEYCOMB': 120,
    'BOXNET': 120,
    'JAGUARD': 120,
    'Custom / Other': 120,
  },
  dtfMaterials: {
    'SALEENA': 180,
    'SUPERPOLY': 170,
    'LYCRA 2 WAY': 210,
    'LYCRA 4 WAY': 240,
    'PP': 190,
    'POPNIT': 190,
    'DOTKNIT 140': 200,
    'DOTKNIT 180': 220,
    'HONEYCOMB': 230,
    'BOXNET': 240,
    'JAGUARD': 250,
    'Custom / Other': 180,
  },
  dtfRates: {
    'front': 50,
    'back': 50,
    'front and back': 90,
    'a4 size': 60,
    'a3 size': 80,
  },
};

const PRICING_DOC_PATH = 'pricing_settings/rates';

const LEGACY_OBSOLETE_KEYS = [
  'DRYFIT',
  'SUPER POLY',
  'MICRO PP',
  'SALEENA',
  'INTERLOCK',
  'DOT KNIT',
  'PURE COTTON',
  'POLY COTTON',
  'NJS',
  'MARS',
  '100% PURE COTTON'
];

/**
 * Fetch Pricing Rates from Firestore or return Defaults
 */
export async function getPricingRates(): Promise<PricingRates> {
  try {
    const docRef = doc(db, PRICING_DOC_PATH);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as Partial<PricingRates>;
      const rawMaterials = data.materials || {};
      
      const cleanedMaterials: Record<string, number> = { ...DEFAULT_PRICING_RATES.materials };

      // Overwrite rates from Firestore for valid keys and purge legacy keys
      for (const [k, v] of Object.entries(rawMaterials)) {
        const upperK = k.trim().toUpperCase();
        // If the key is not in DEFAULT_PRICING_RATES.materials AND matches a legacy name, skip it
        const isLegacyKey = LEGACY_OBSOLETE_KEYS.includes(upperK) && !DEFAULT_PRICING_RATES.materials[k];
        if (!isLegacyKey && typeof v === 'number') {
          cleanedMaterials[k] = v;
        }
      }

      const rawDtfMaterials = data.dtfMaterials || {};
      const cleanedDtfMaterials: Record<string, number> = { ...DEFAULT_PRICING_RATES.dtfMaterials };
      for (const [k, v] of Object.entries(rawDtfMaterials)) {
        if (typeof v === 'number') {
          cleanedDtfMaterials[k] = v;
        }
      }

      return {
        materials: cleanedMaterials,
        sleeves: { ...DEFAULT_PRICING_RATES.sleeves, ...(data.sleeves || {}) },
        necks: { ...DEFAULT_PRICING_RATES.necks, ...(data.necks || {}) },
        shortsRate: typeof data.shortsRate === 'number' ? data.shortsRate : DEFAULT_PRICING_RATES.shortsRate,
        shortsMaterials: { ...DEFAULT_PRICING_RATES.shortsMaterials, ...(data.shortsMaterials || {}) },
        dtfMaterials: cleanedDtfMaterials,
        dtfRates: { ...DEFAULT_PRICING_RATES.dtfRates, ...(data.dtfRates || {}) },
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
    await setDoc(docRef, updatedRates);
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
  dtfOption?: string;
}) {
  const { clothType, sleeveType, neckType, hasShorts, pieces, rates, dtfOption = 'none' } = params;

  // Determine if it is DTF or Sublimation
  const isDtf = dtfOption && dtfOption !== 'none';

  // Material Base Rate
  let materialRate = 0;
  if (isDtf) {
    materialRate = rates.dtfMaterials?.[clothType] ?? rates.dtfMaterials?.['Custom / Other'] ?? 180;
  } else {
    materialRate = rates.materials[clothType] ?? rates.materials['Custom / Other'] ?? 250;
  }

  // DTF Option Add-on
  let dtfAddon = 0;
  if (isDtf) {
    const key = dtfOption.toLowerCase();
    dtfAddon = rates.dtfRates?.[key] ?? 0;
  }

  // Sleeve Rate Adjustment
  const sleeveKey = (sleeveType || 'half').toLowerCase();
  const sleeveRate = rates.sleeves[sleeveKey] ?? 0;

  // Neck Rate Adjustment
  const neckRate = rates.necks[neckType] ?? rates.necks['Custom / Other'] ?? 0;

  // Shorts Rate
  const shortsRate = hasShorts
    ? (rates.shortsMaterials?.[clothType] ?? rates.shortsMaterials?.[clothType.toUpperCase()] ?? rates.shortsMaterials?.['Custom / Other'] ?? rates.shortsRate ?? 120)
    : 0;

  // Unit Rate per piece
  const unitRate = materialRate + dtfAddon + sleeveRate + neckRate + shortsRate;

  // Total Amount
  const totalAmount = Math.max(0, unitRate * (pieces || 1));

  return {
    materialRate,
    dtfAddon,
    sleeveRate,
    neckRate,
    shortsRate,
    unitRate,
    totalAmount,
  };
}

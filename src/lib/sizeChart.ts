import { db } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

export interface SizeChartSection {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  enabled: boolean;
}

export interface SizeChartData {
  id?: string;
  name: string;
  companyName: string;
  category: string;
  unit: 'inches' | 'cm';
  tolerance: string;
  accentColor: string;
  notes: string;
  orientation: 'landscape' | 'portrait';
  sections: SizeChartSection[];
  updatedAt?: string;
  createdAt?: string;
}

export const DEFAULT_SIZE_CHART: SizeChartData = {
  id: 'pm_standard_garment',
  name: 'Standard Garment Size Chart',
  companyName: 'PRINT MART',
  category: 'JERSEY & T-SHIRT SPECIFICATIONS',
  unit: 'inches',
  tolerance: '± 0.5 Inch',
  accentColor: '#e65100', // vibrant vermilion orange from sample
  notes: '• All measurements are in inches. • Standard manufacturing tolerance: +/- 0.5″.\n• Width is measured flat across the chest from armpit to armpit.\n• Height is measured from high-point shoulder seam down to bottom hem.\n• Sleeve length is measured from shoulder joint to cuff edge.',
  orientation: 'landscape',
  sections: [
    {
      id: 'body',
      title: 'BODY',
      columns: ['AGE', 'SIZE', 'WIDTH', 'HEIGHT'],
      rows: [
        ['1 - 2', '22', '12.5', '18'],
        ['3 - 4', '24', '13.5', '19.5'],
        ['5 - 6', '26', '14.5', '21'],
        ['7 - 8', '28', '15.5', '22.5'],
        ['9 - 10', '30', '16.5', '24'],
        ['11 - 12', '32', '17.5', '25.5'],
        ['XS', '34', '18.5', '27'],
        ['S', '36', '19.5', '28'],
        ['M', '38', '20.5', '29'],
        ['L', '40', '21.5', '30'],
        ['XL', '42', '22.5', '31'],
        ['XXL', '44', '23.5', '32'],
        ['XXXL', '46', '24.5', '33'],
        ['XXXXL', '48', '25.5', '33.5'],
        ['XXXXXL', '50', '26.5', '34.5'],
      ],
      enabled: true,
    },
    {
      id: 'half_sleeve',
      title: 'HALF SLEEVE',
      columns: ['SIZE', 'WIDTH', 'HEIGHT'],
      rows: [
        ['22 - 24', '12', '6.5'],
        ['26', '12.5', '7'],
        ['28', '13.5', '7.2'],
        ['30', '14.5', '7.5'],
        ['32', '15.5', '8'],
        ['34', '16', '9.5'],
        ['36', '17', '10'],
        ['38', '17.5', '10.5'],
        ['40', '18.5', '10.7'],
        ['42', '19.5', '11'],
        ['44', '20', '11.5'],
        ['46', '21.5', '11.5'],
        ['48', '22', '12'],
        ['50', '23.5', '12.5'],
      ],
      enabled: true,
    },
    {
      id: 'full_sleeve',
      title: 'FULL SLEEVE',
      columns: ['SIZE', 'WIDTH', 'HEIGHT'],
      rows: [
        ['22 - 24', '12', '18'],
        ['26', '12.5', '19'],
        ['28', '13.5', '20.5'],
        ['30', '14.5', '21'],
        ['32', '15.5', '22'],
        ['34', '16', '24'],
        ['36', '17', '24'],
        ['38', '17.5', '24.5'],
        ['40', '18.5', '24.5'],
        ['42', '19.5', '25.5'],
        ['44', '20', '25.5'],
        ['46', '21.5', '27'],
        ['48', '22', '27'],
        ['50', '23.5', '28'],
      ],
      enabled: true,
    },
  ],
};

export const PRESET_TEMPLATES: Record<string, Partial<SizeChartData>> = {
  'standard_garment': {
    ...DEFAULT_SIZE_CHART,
    name: 'Print Mart Standard T-Shirt & Jersey (Body, Half & Full)',
  },
  'body_only': {
    name: 'Body Only (Adults & Kids)',
    category: 'ROUND NECK T-SHIRT / JERSEY',
    orientation: 'portrait',
    sections: [DEFAULT_SIZE_CHART.sections[0]],
  },
  'adults_only': {
    name: 'Adults Only Sizes (XS to 5XL)',
    category: 'ADULT SPORTS APPAREL',
    orientation: 'landscape',
    sections: [
      {
        id: 'body',
        title: 'BODY',
        columns: ['SIZE', 'WIDTH', 'HEIGHT'],
        rows: [
          ['XS (34)', '18.5', '27'],
          ['S (36)', '19.5', '28'],
          ['M (38)', '20.5', '29'],
          ['L (40)', '21.5', '30'],
          ['XL (42)', '22.5', '31'],
          ['2XL (44)', '23.5', '32'],
          ['3XL (46)', '24.5', '33'],
          ['4XL (48)', '25.5', '33.5'],
          ['5XL (50)', '26.5', '34.5'],
        ],
        enabled: true,
      },
      {
        id: 'half_sleeve',
        title: 'HALF SLEEVE',
        columns: ['SIZE', 'WIDTH', 'HEIGHT'],
        rows: [
          ['XS (34)', '16', '9.5'],
          ['S (36)', '17', '10'],
          ['M (38)', '17.5', '10.5'],
          ['L (40)', '18.5', '10.7'],
          ['XL (42)', '19.5', '11'],
          ['2XL (44)', '20', '11.5'],
          ['3XL (46)', '21.5', '11.5'],
          ['4XL (48)', '22', '12'],
          ['5XL (50)', '23.5', '12.5'],
        ],
        enabled: true,
      },
      {
        id: 'full_sleeve',
        title: 'FULL SLEEVE',
        columns: ['SIZE', 'WIDTH', 'HEIGHT'],
        rows: [
          ['XS (34)', '16', '24'],
          ['S (36)', '17', '24'],
          ['M (38)', '17.5', '24.5'],
          ['L (40)', '18.5', '24.5'],
          ['XL (42)', '19.5', '25.5'],
          ['2XL (44)', '20', '25.5'],
          ['3XL (46)', '21.5', '27'],
          ['4XL (48)', '22', '27'],
          ['5XL (50)', '23.5', '28'],
        ],
        enabled: true,
      }
    ],
  },
  'shorts_track': {
    name: 'Shorts & Track Pants Specification',
    category: 'SPORTS BOTTOM WEAR',
    orientation: 'portrait',
    sections: [
      {
        id: 'shorts',
        title: 'SHORTS',
        columns: ['SIZE', 'WAIST (STRETCH)', 'LENGTH', 'THIGH'],
        rows: [
          ['24', '18 - 24', '14', '9'],
          ['26', '20 - 26', '15', '9.5'],
          ['28', '22 - 28', '16', '10'],
          ['30', '24 - 30', '17', '10.5'],
          ['32', '26 - 32', '18', '11'],
          ['34', '28 - 34', '19', '11.5'],
          ['36', '30 - 36', '20', '12'],
          ['38', '32 - 38', '20.5', '12.5'],
          ['40', '34 - 40', '21', '13'],
          ['42', '36 - 42', '21.5', '13.5'],
          ['44', '38 - 44', '22', '14'],
        ],
        enabled: true,
      },
    ],
  },
};

const LOCAL_STORAGE_KEY = 'printmart_saved_size_charts_v1';
const ACTIVE_CHART_KEY = 'printmart_active_size_chart_v1';

export const getSavedLocalCharts = (): SizeChartData[] => {
  if (typeof window === 'undefined') return [DEFAULT_SIZE_CHART];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [DEFAULT_SIZE_CHART];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [DEFAULT_SIZE_CHART];
  } catch {
    return [DEFAULT_SIZE_CHART];
  }
};

export const saveLocalCharts = (charts: SizeChartData[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(charts));
  } catch (err) {
    console.error('Failed to save size charts locally:', err);
  }
};

export const getActiveLocalChart = (): SizeChartData => {
  if (typeof window === 'undefined') return DEFAULT_SIZE_CHART;
  try {
    const raw = localStorage.getItem(ACTIVE_CHART_KEY);
    if (!raw) return DEFAULT_SIZE_CHART;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SIZE_CHART;
  }
};

export const setActiveLocalChart = (chart: SizeChartData): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_CHART_KEY, JSON.stringify(chart));
  } catch (err) {
    console.error('Failed to set active chart:', err);
  }
};

// Firestore cloud sync
export const saveSizeChartToFirestore = async (chart: SizeChartData): Promise<string> => {
  const chartId = chart.id || `chart_${Date.now()}`;
  const recordToSave: SizeChartData = {
    ...chart,
    id: chartId,
    updatedAt: new Date().toISOString(),
    createdAt: chart.createdAt || new Date().toISOString(),
  };

  // Save to Firestore
  try {
    const ref = doc(db, 'size_charts', chartId);
    await setDoc(ref, recordToSave);
  } catch (err) {
    console.warn('Firestore write warning (saving locally as fallback):', err);
  }

  // Always sync to LocalStorage
  const localList = getSavedLocalCharts();
  const existingIdx = localList.findIndex((c) => c.id === chartId);
  if (existingIdx >= 0) {
    localList[existingIdx] = recordToSave;
  } else {
    localList.unshift(recordToSave);
  }
  saveLocalCharts(localList);
  setActiveLocalChart(recordToSave);

  return chartId;
};

export const fetchAllSizeCharts = async (): Promise<SizeChartData[]> => {
  const localList = getSavedLocalCharts();
  try {
    const colRef = collection(db, 'size_charts');
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const fromDb: SizeChartData[] = [];
      snap.forEach((d) => {
        fromDb.push(d.data() as SizeChartData);
      });
      // Merge with local items avoiding duplicate IDs
      const map = new Map<string, SizeChartData>();
      localList.forEach((c) => c.id && map.set(c.id, c));
      fromDb.forEach((c) => c.id && map.set(c.id, c));
      const merged = Array.from(map.values());
      saveLocalCharts(merged);
      return merged;
    }
  } catch (err) {
    console.warn('Could not fetch from Firestore, returning local:', err);
  }
  return localList;
};

export const deleteSizeChartFromStorage = async (chartId: string): Promise<void> => {
  try {
    const ref = doc(db, 'size_charts', chartId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Firestore delete error:', err);
  }

  const localList = getSavedLocalCharts().filter((c) => c.id !== chartId);
  saveLocalCharts(localList);
};

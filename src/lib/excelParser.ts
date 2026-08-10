import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

export interface PlayerDetail {
  name: string;
  size: string;
  number: string;
  shortsSize?: string;
  sleeve?: string;
  isGK?: boolean;
}

/**
 * Converts letter sizes (XS, S, M, L, XL, XXL/2XL, 3XL/XXXL, 4XL/XXXXL, 5XL/XXXXXL)
 * into company standard numeric size strings (34, 36, 38, 40, 42, 44, 46, 48, 50).
 */
export const convertLetterSizeToNumber = (rawSize: string): string => {
  if (!rawSize) return '';
  const trimmed = rawSize.trim();
  const cleaned = trimmed.toUpperCase().replace(/[\s\-_]+/g, '');

  switch (cleaned) {
    case 'XS':
      return '34';
    case 'S':
      return '36';
    case 'M':
      return '38';
    case 'L':
      return '40';
    case 'XL':
      return '42';
    case 'XXL':
    case '2XL':
      return '44';
    case 'XXXL':
    case '3XL':
      return '46';
    case 'XXXXL':
    case '4XL':
      return '48';
    case 'XXXXXL':
    case '5XL':
      return '50';
    default:
      return trimmed;
  }
};

/**
 * Checks if a cell string represents a clothing size (e.g. 42, 40, 38, S, M, L, XL, KIDS, etc.)
 */
const isSizeValue = (val: string): boolean => {
  if (!val) return false;
  const cleaned = val.trim().toUpperCase().replace(/[\s\-_]+/g, '');
  return /^(30|32|34|36|38|40|42|44|46|48|50|XS|S|M|L|XL|2XL|XXL|3XL|XXXL|4XL|XXXXL|5XL|XXXXXL|KIDS|FREE|OVERSIZE|\d{2})$/i.test(cleaned);
};

/**
 * Directly parses an uploaded Excel (.xlsx, .xls, .csv, .tsv) File
 * matching your company's format:
 * Col 1: NAME
 * Col 2: NUMBER
 * Col 3: IGNORED
 * Col 4: SIZE
 */
export const parseExcelFile = async (file: File): Promise<PlayerDetail[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          return resolve([]);
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert sheet to array of rows (header: 1 gives 2D array)
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length === 0) return resolve([]);

        let nameIdx = -1;
        let numIdx = -1;
        let sizeIdx = -1;
        let startRowIdx = 0;

        // Scan first 5 rows to locate header indices if present
        for (let r = 0; r < Math.min(rows.length, 5); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;

          for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim().toLowerCase();
            if (/^(name|player|player\s*name)$/i.test(cellVal)) nameIdx = c;
            if (/^(no|no\.|number|jersey\s*no|jersey\s*number|chest\s*no)$/i.test(cellVal)) numIdx = c;
            if (/^(size|chest|cloth\s*size)$/i.test(cellVal)) sizeIdx = c;
          }

          if (nameIdx !== -1 || sizeIdx !== -1 || numIdx !== -1) {
            startRowIdx = r + 1; // data starts after header
            break;
          }
        }

        // If no headers matched explicitly, set company default column layout:
        // Col 1 (Idx 0): Name
        // Col 2 (Idx 1): Number
        // Col 3 (Idx 2): IGNORED
        // Col 4 (Idx 3): Size
        if (nameIdx === -1) nameIdx = 0;
        if (numIdx === -1) numIdx = 1;
        if (sizeIdx === -1) sizeIdx = 3; // 4th column

        const players: PlayerDetail[] = [];

        for (let r = startRowIdx; r < rows.length; r++) {
          const row = rows[r];
          if (!Array.isArray(row) || row.length === 0) continue;

          const name = String(row[nameIdx] ?? '').trim();
          let number = String(row[numIdx] ?? '').trim();
          let rawSize = String(row[sizeIdx] ?? '').trim();

          // Fallback if sheet has 3 columns total (Name, Number, Size without empty 3rd column)
          if (!rawSize && row.length >= 3 && isSizeValue(String(row[2] ?? ''))) {
            rawSize = String(row[2] ?? '').trim();
          }

          // Skip repeated header row if found
          if (/^(name|player|size|no|number)$/i.test(name) && /^(size|no|number)$/i.test(rawSize)) continue;
          if (!name && !rawSize && !number) continue;

          const size = convertLetterSizeToNumber(rawSize);
          const isGK = /\b(GK|G\.K|GOAL\s*KEEPER|KEEPER)\b/i.test(name);
          players.push({ name, size, number, isGK: isGK ? true : undefined });
        }

        resolve(players);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Strips non-printable characters, binary noise, and replacement characters.
 */
export const cleanText = (str: string): string => {
  if (!str) return '';
  return str.replace(/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').trim();
};

/**
 * Checks if a string contains binary gibberish noise.
 */
export const isGibberish = (str: string): boolean => {
  if (!str) return true;
  const clean = cleanText(str);
  if (clean.length < 2) return true;
  // If string contains non-latin/non-printable symbols over 30%, it's binary gibberish
  const weirdSymbols = (clean.match(/[^a-zA-Z0-9\s\-_\.'#]/g) || []).length;
  return (weirdSymbols / clean.length) > 0.3;
};

/**
 * Parses raw text copied from Excel tables matching company layout:
 * 1st: NAME, 2nd: NUMBER, 3rd: IGNORED, 4th: SIZE
 */
export const parseExcelText = (text: string): PlayerDetail[] => {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const players: PlayerDetail[] = [];

  const addPlayerIfValid = (rawName: string, rawSize: string, rawNumber: string) => {
    const cName = cleanText(rawName);
    const cSize = convertLetterSizeToNumber(cleanText(rawSize));
    const cNum = cleanText(rawNumber);

    if (!cName || isGibberish(cName)) return;
    if (/^(name|player|sl\s*no|sr\s*no|size|no|number|customer|order|info)$/i.test(cName)) return;

    const isGK = /\b(GK|G\.K|GOAL\s*KEEPER|KEEPER)\b/i.test(cName);

    players.push({
      name: cName,
      size: cSize,
      number: cNum,
      isGK: isGK ? true : undefined,
    });
  };

  for (const line of lines) {
    const trimmed = cleanText(line);
    if (!trimmed || isGibberish(trimmed)) continue;

    if (/^(name|player|sl\s*no|sr\s*no)\b/i.test(trimmed)) continue;

    const parts = trimmed.split(/[\t,]+/).map((p) => cleanText(p));

    if (parts.length >= 4) {
      // 1st: Name, 2nd: Number, 3rd: Ignore, 4th: Size
      addPlayerIfValid(parts[0], parts[3], parts[1]);
    } else if (parts.length === 3) {
      // Check if 3rd column is Size
      if (isSizeValue(parts[2])) {
        addPlayerIfValid(parts[0], parts[2], parts[1]);
      } else if (isSizeValue(parts[1])) {
        // Name, Size, Number
        addPlayerIfValid(parts[0], parts[1], parts[2]);
      } else {
        addPlayerIfValid(parts[0], parts[2], parts[1]);
      }
    } else if (parts.length === 2) {
      if (isSizeValue(parts[1])) {
        addPlayerIfValid(parts[0], parts[1], '');
      } else {
        addPlayerIfValid(parts[0], '', parts[1]);
      }
    } else {
      const spaceParts = trimmed.split(/\s+/);
      if (spaceParts.length >= 4) {
        const size = spaceParts.pop() || '';
        spaceParts.pop(); // Ignore 3rd
        const number = spaceParts.pop() || '';
        const name = spaceParts.join(' ');
        addPlayerIfValid(name, size, number);
      } else if (spaceParts.length === 3) {
        const last = spaceParts.pop() || '';
        const mid = spaceParts.pop() || '';
        const name = spaceParts.join(' ');
        if (isSizeValue(last)) {
          addPlayerIfValid(name, last, mid);
        } else {
          addPlayerIfValid(name, mid, last);
        }
      }
    }
  }

  return players;
};

/**
 * Fallback raw text extractor from PDF ArrayBuffer
 */
const extractRawPdfText = (arrayBuffer: ArrayBuffer): string => {
  try {
    const decoder = new TextDecoder('utf-8');
    const bytes = new Uint8Array(arrayBuffer);
    const rawStr = decoder.decode(bytes);

    const textLines: string[] = [];

    // Match text objects inside BT ... ET blocks
    const btBlocks = rawStr.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btBlocks) {
      // Extract Tj and TJ strings e.g. (NAME) Tj or [(PLAYER) 10 (SIZE)] TJ
      const strMatches = block.match(/\(([^)]+)\)\s*Tj|\[([^\]]+)\]\s*TJ/g) || [];
      let blockText = '';
      for (const m of strMatches) {
        const cleaned = m.replace(/^\(/, '').replace(/\)\s*Tj$/, '').replace(/^\[/, '').replace(/\]\s*TJ$/, '').replace(/\\/g, '');
        const strParts = cleaned.match(/\(([^)]+)\)/g);
        if (strParts) {
          blockText += strParts.map(s => s.slice(1, -1)).join(' ');
        } else {
          blockText += ' ' + cleaned;
        }
      }
      if (blockText.trim()) textLines.push(blockText.trim());
    }

    // If no BT/ET blocks matched, find printable text strings in parenthesized blocks
    if (textLines.length === 0) {
      const lines = rawStr.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/\(([^)]{2,})\)/g);
        if (match) {
          const lineText = match.map(m => m.slice(1, -1)).join(' ').trim();
          if (lineText.length > 2) textLines.push(lineText);
        }
      }
    }

    return textLines.join('\n');
  } catch (e) {
    console.error('Error in raw PDF text extraction:', e);
    return '';
  }
};

/**
 * Directly parses an uploaded PDF file (.pdf)
 * extracting all player roster rows (NAME, NUMBER, SIZE) and text info!
 */
export const parsePdfFile = async (file: File): Promise<PlayerDetail[]> => {
  const arrayBuffer = await file.arrayBuffer();

  // Layer 1: pdfjs-dist structured text items
  try {
    // @ts-ignore
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
    }

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, useSystemFonts: true }).promise;
    let fullTextLines: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Group text items by Y coordinate (rows)
      const rowMap: Record<number, string[]> = {};
      for (const item of textContent.items as any[]) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5]); // Y coordinate
        if (!rowMap[y]) rowMap[y] = [];
        rowMap[y].push(item.str);
      }

      // Sort rows top-to-bottom
      const sortedY = Object.keys(rowMap).map(Number).sort((a, b) => b - a);
      for (const y of sortedY) {
        const lineStr = rowMap[y].join('\t').trim();
        if (lineStr) fullTextLines.push(lineStr);
      }
    }

    const extracted = parseExcelText(fullTextLines.join('\n'));
    if (extracted.length > 0) return extracted;
  } catch (pdfErr) {
    console.warn('pdfjs-dist warning, attempting OCR and stream parser fallback:', pdfErr);
  }

  // Layer 2: Optical Character Recognition (OCR) via Tesseract for Scanned Image PDFs
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');

    const ret = await worker.recognize(file);
    await worker.terminate();

    const ocrText = ret.data.text || '';
    const ocrExtracted = parseExcelText(ocrText);
    if (ocrExtracted.length > 0) return ocrExtracted;
  } catch (ocrErr) {
    console.warn('Tesseract OCR fallback warning:', ocrErr);
  }

  // Layer 3 Fallback: Raw Stream & Text Decoder
  const rawText = extractRawPdfText(arrayBuffer);
  return parseExcelText(rawText);
};

/**
 * Auto-calculates size summary counts e.g. "42X5  40X3  38X4"
 * and total piece counts from a player roster.
 */
export const calculateSizeBreakdown = (players: PlayerDetail[]) => {
  const countsBySize: Record<string, number> = {};
  let totalPieces = 0;

  for (const p of players) {
    let raw = (p.size || '').trim();
    if (!raw || raw === 'XXX' || raw === '-' || raw === 'N/A' || raw === 'NIL' || raw === 'NONE' || raw === 'UNSPECIFIED') continue;
    const sz = convertLetterSizeToNumber(raw);
    countsBySize[sz] = (countsBySize[sz] || 0) + 1;
    totalPieces += 1;
  }

  const summaryArray = Object.entries(countsBySize).map(([size, count]) => `${size}X${count}`);
  const summaryString = summaryArray.join('  ');

  return { summaryString, summaryArray, totalPieces, countsBySize };
};

/**
 * Auto-calculates shorts size summary counts e.g. "32X5  34X8  36X4"
 * and total shorts piece counts from a player roster.
 */
export const calculateShortsBreakdown = (players: PlayerDetail[]) => {
  const countsBySize: Record<string, number> = {};
  let totalPieces = 0;

  for (const p of players) {
    if (!p.shortsSize) continue;
    let raw = p.shortsSize.trim();
    if (!raw || raw === 'XXX' || raw === '-' || raw === 'N/A' || raw === 'NIL' || raw === 'NONE' || raw === 'NO') continue;
    const sz = convertLetterSizeToNumber(raw);
    countsBySize[sz] = (countsBySize[sz] || 0) + 1;
    totalPieces += 1;
  }

  const summaryArray = Object.entries(countsBySize).map(([size, count]) => `${size}X${count}`);
  const summaryString = summaryArray.join('  ');

  return { summaryString, summaryArray, totalPieces, countsBySize };
};

/**
 * Converts a player roster list into an Excel CSV file formatted with:
 * Column 1: NAME
 * Column 2: NUMBER
 * Column 3: SIZE
 * (and optional extra columns for Sleeve, Shorts Size if present)
 */
export const exportPlayersToCSV = (
  players: PlayerDetail[],
  filenamePrefix: string = 'Player_Roster',
  hasShorts?: boolean
) => {
  if (!players || players.length === 0) {
    toast.error('No players in the roster list to export!');
    return;
  }

  const escapeCsv = (val: any) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = ['NAME', 'NUMBER', 'SIZE'];
  const hasShortsData = hasShorts || players.some(p => p.shortsSize && p.shortsSize.trim() !== '');

  if (hasShortsData) {
    headers.push('SHORTS_SIZE');
  }

  const rows = players.map((p) => {
    const nameVal = p.isGK ? `${p.name} (GK)` : p.name;
    const row = [
      escapeCsv(nameVal),
      escapeCsv(p.number || ''),
      escapeCsv(p.size || '')
    ];
    if (hasShortsData) {
      row.push(escapeCsv(p.shortsSize || ''));
    }
    return row.join(',');
  });

  // Adding UTF-8 BOM (\uFEFF) so Microsoft Excel opens character formatting correctly
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanPrefix = filenamePrefix.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const fileName = `${cleanPrefix}_Roster.csv`;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${players.length} players to Excel CSV (${fileName})!`);
};

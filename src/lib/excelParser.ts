import * as XLSX from 'xlsx';

export interface PlayerDetail {
  name: string;
  size: string;
  number: string;
}

/**
 * Checks if a cell string represents a clothing size (e.g. 42, 40, 38, S, M, L, XL, KIDS, etc.)
 */
const isSizeValue = (val: string): boolean => {
  if (!val) return false;
  const cleaned = val.trim().toUpperCase();
  return /^(30|32|34|36|38|40|42|44|46|48|50|XS|S|M|L|XL|2XL|3XL|4XL|5XL|KIDS|FREE|OVERSIZE|\d{2})$/i.test(cleaned);
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
          let size = String(row[sizeIdx] ?? '').trim();

          // Fallback if sheet has 3 columns total (Name, Number, Size without empty 3rd column)
          if (!size && row.length >= 3 && isSizeValue(String(row[2] ?? ''))) {
            size = String(row[2] ?? '').trim();
          }

          // Skip repeated header row if found
          if (/^(name|player|size|no|number)$/i.test(name) && /^(size|no|number)$/i.test(size)) continue;
          if (!name && !size && !number) continue;

          players.push({ name, size, number });
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
 * Parses raw text copied from Excel tables matching company layout:
 * 1st: NAME, 2nd: NUMBER, 3rd: IGNORED, 4th: SIZE
 */
export const parseExcelText = (text: string): PlayerDetail[] => {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const players: PlayerDetail[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^(name|player|sl\s*no|sr\s*no)\b/i.test(trimmed)) continue;

    const parts = trimmed.split(/[\t,]+/).map((p) => p.trim());

    if (parts.length >= 4) {
      // 1st: Name, 2nd: Number, 3rd: Ignore, 4th: Size
      players.push({
        name: parts[0],
        number: parts[1],
        size: parts[3],
      });
    } else if (parts.length === 3) {
      // Check if 3rd column is Size
      if (isSizeValue(parts[2])) {
        players.push({
          name: parts[0],
          number: parts[1],
          size: parts[2],
        });
      } else if (isSizeValue(parts[1])) {
        // Name, Size, Number
        players.push({
          name: parts[0],
          size: parts[1],
          number: parts[2],
        });
      } else {
        players.push({
          name: parts[0],
          number: parts[1],
          size: parts[2],
        });
      }
    } else if (parts.length === 2) {
      if (isSizeValue(parts[1])) {
        players.push({ name: parts[0], size: parts[1], number: '' });
      } else {
        players.push({ name: parts[0], number: parts[1], size: '' });
      }
    } else {
      const spaceParts = trimmed.split(/\s+/);
      if (spaceParts.length >= 4) {
        const size = spaceParts.pop() || '';
        spaceParts.pop(); // Ignore 3rd
        const number = spaceParts.pop() || '';
        const name = spaceParts.join(' ');
        players.push({ name, size, number });
      } else if (spaceParts.length === 3) {
        const last = spaceParts.pop() || '';
        const mid = spaceParts.pop() || '';
        const name = spaceParts.join(' ');
        if (isSizeValue(last)) {
          players.push({ name, number: mid, size: last });
        } else {
          players.push({ name, size: mid, number: last });
        }
      }
    }
  }

  return players;
};

/**
 * Auto-calculates size summary counts e.g. "42X5  40X3  38X4"
 * and total piece counts from a player roster.
 */
export const calculateSizeBreakdown = (players: PlayerDetail[]) => {
  const countsBySize: Record<string, number> = {};
  let totalPieces = 0;

  for (const p of players) {
    const sz = (p.size || 'Unspecified').toUpperCase().trim();
    if (!sz) continue;
    countsBySize[sz] = (countsBySize[sz] || 0) + 1;
    totalPieces += 1;
  }

  const summaryArray = Object.entries(countsBySize).map(([size, count]) => `${size}X${count}`);
  const summaryString = summaryArray.join('  ');

  return { summaryString, summaryArray, totalPieces, countsBySize };
};

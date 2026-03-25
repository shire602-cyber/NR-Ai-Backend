/**
 * Bank Statement Parser Service
 * ──────────────────────────────
 * Parses CSV and OFX bank statement files into a unified transaction format.
 * Supports UAE bank presets (Emirates NBD, ADCB, FAB, Mashreq, RAKBANK)
 * plus a generic auto-detect mode.
 */

// ─── Types ──────────────────────────────────────────────────

export interface ParsedTransaction {
  date: string; // ISO date string (YYYY-MM-DD)
  description: string;
  amount: number; // positive = credit/inflow, negative = debit/outflow
  reference?: string;
  balance?: number;
  rawData: Record<string, string>; // original row key-value pairs
}

export type BankPreset = 'emirates_nbd' | 'adcb' | 'fab' | 'mashreq' | 'rakbank' | 'generic';

export interface DetectResult {
  format: 'csv' | 'ofx';
  bankPreset?: BankPreset;
  delimiter?: string;
}

export interface CSVParseOptions {
  dateFormat?: string; // e.g. 'DD/MM/YYYY'
  delimiter?: string;
  bankPreset?: BankPreset;
}

// ─── Date Parsing ───────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Try to parse a date string in multiple common formats.
 * Returns an ISO date string (YYYY-MM-DD) or null if unparseable.
 */
function parseDate(raw: string, preferredFormat?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // YYYY-MM-DD (ISO)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return formatISODate(+y, +m, +d);
  }

  // DD-MMM-YYYY or DD/MMM/YYYY (e.g. 15-Jan-2024)
  const dmmmy = s.match(/^(\d{1,2})[\/-]([A-Za-z]{3})[\/-](\d{4})/);
  if (dmmmy) {
    const [, d, mon, y] = dmmmy;
    const m = MONTH_NAMES[mon.toLowerCase()];
    if (m !== undefined) {
      return formatISODate(+y, m + 1, +d);
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    const [, a, b, y] = dmy;
    if (preferredFormat === 'MM/DD/YYYY') {
      return formatISODate(+y, +a, +b); // a=month, b=day
    }
    // Default: DD/MM/YYYY (common in UAE)
    return formatISODate(+y, +b, +a); // b=month, a=day
  }

  // MM/DD/YYYY or MM-DD-YYYY (US format) — only if explicitly requested
  // Already handled above in the DD/MM/YYYY branch with format check

  // YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return formatISODate(+y, +m, +d);
  }

  // Try native parsing as last resort
  const native = new Date(s);
  if (!isNaN(native.getTime())) {
    return native.toISOString().split('T')[0];
  }

  return null;
}

function formatISODate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Amount Parsing ─────────────────────────────────────────

/**
 * Parse an amount string, handling both 1,234.56 and 1.234,56 (European) formats.
 * Returns a number or NaN if unparseable.
 */
function parseAmount(raw: string | undefined | null): number {
  if (!raw || !raw.trim()) return 0;
  let s = raw.trim();

  // Remove currency symbols and whitespace
  s = s.replace(/[A-Za-z$€£¥₹\s]/g, '');

  // Detect European format: last separator is comma (e.g., 1.234,56)
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European: 1.234,56 → 1234.56
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Standard: 1,234.56 → 1234.56
    s = s.replace(/,/g, '');
  }

  // Handle parenthetical negatives: (123.45) → -123.45
  const parenMatch = s.match(/^\((.+)\)$/);
  if (parenMatch) {
    s = '-' + parenMatch[1];
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

// ─── CSV Utilities ──────────────────────────────────────────

/**
 * Auto-detect the CSV delimiter by checking frequency in the first few lines.
 */
function detectDelimiter(content: string): string {
  const candidates = [',', ';', '\t', '|'];
  const lines = content.split(/\r?\n/).filter(l => l.trim()).slice(0, 10);
  if (lines.length === 0) return ',';

  let bestDelim = ',';
  let bestScore = 0;

  for (const delim of candidates) {
    // Count how consistent the column count is across lines
    const counts = lines.map(l => splitCSVLine(l, delim).length);
    const maxCount = Math.max(...counts);
    if (maxCount < 2) continue;

    // Score: consistency * column count
    const consistent = counts.filter(c => c === maxCount).length;
    const score = consistent * maxCount;
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

/**
 * Split a CSV line respecting quoted fields.
 */
function splitCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Header Detection ───────────────────────────────────────

/** Keywords that identify the header row */
const HEADER_KEYWORDS = [
  'date', 'amount', 'description', 'balance', 'reference',
  'debit', 'credit', 'narration', 'value', 'transaction',
  'dr', 'cr', 'particulars', 'remarks', 'ref',
];

function isHeaderRow(fields: string[]): boolean {
  const lower = fields.map(f => f.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const matchCount = lower.filter(f =>
    HEADER_KEYWORDS.some(kw => f.includes(kw))
  ).length;
  // At least 2 keyword matches to be considered a header
  return matchCount >= 2;
}

/**
 * Detect which column maps to which field based on header names.
 */
interface ColumnMapping {
  dateCol: number;
  valueDateCol?: number;
  descCol: number;
  debitCol?: number;
  creditCol?: number;
  amountCol?: number;
  balanceCol?: number;
  referenceCol?: number;
}

function detectColumns(headers: string[]): ColumnMapping | null {
  const lower = headers.map(h => h.toLowerCase().trim());

  let dateCol = -1;
  let valueDateCol: number | undefined;
  let descCol = -1;
  let debitCol: number | undefined;
  let creditCol: number | undefined;
  let amountCol: number | undefined;
  let balanceCol: number | undefined;
  let referenceCol: number | undefined;

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];

    // Date column
    if (dateCol === -1 && (
      h === 'date' || h === 'transaction date' || h === 'trans date' ||
      h === 'txn date' || h === 'posting date' || h.includes('transaction date')
    )) {
      dateCol = i;
    } else if (h === 'value date' || h === 'value_date') {
      valueDateCol = i;
    }

    // Description
    if (descCol === -1 && (
      h === 'description' || h === 'narration' || h === 'particulars' ||
      h === 'details' || h === 'remarks' || h === 'memo' ||
      h.includes('description') || h.includes('narration')
    )) {
      descCol = i;
    }

    // Debit
    if (debitCol === undefined && (
      h === 'debit' || h === 'debit amount' || h === 'dr amount' ||
      h === 'dr' || h === 'withdrawal' || h === 'withdrawals' ||
      h.includes('debit')
    )) {
      debitCol = i;
    }

    // Credit
    if (creditCol === undefined && (
      h === 'credit' || h === 'credit amount' || h === 'cr amount' ||
      h === 'cr' || h === 'deposit' || h === 'deposits' ||
      h.includes('credit')
    )) {
      creditCol = i;
    }

    // Single amount column
    if (amountCol === undefined && (
      h === 'amount' || h === 'transaction amount' || h === 'txn amount'
    )) {
      amountCol = i;
    }

    // Balance
    if (balanceCol === undefined && (
      h === 'balance' || h === 'running balance' || h === 'closing balance' ||
      h.includes('balance')
    )) {
      balanceCol = i;
    }

    // Reference
    if (referenceCol === undefined && (
      h === 'reference' || h === 'ref' || h === 'ref no' ||
      h === 'reference number' || h === 'cheque no' || h === 'check no' ||
      h.includes('reference')
    )) {
      referenceCol = i;
    }
  }

  // Must have at least a date column
  if (dateCol === -1) {
    // Fallback: try to find any column with 'date' in it
    dateCol = lower.findIndex(h => h.includes('date'));
  }

  // Must have at least description
  if (descCol === -1) {
    // Fallback: look for longest text-looking column
    descCol = lower.findIndex(h =>
      h.includes('particular') || h.includes('detail') || h.includes('memo')
    );
    if (descCol === -1) descCol = 1; // second column is often description
  }

  // Must have either debit+credit or a single amount column
  if (debitCol === undefined && creditCol === undefined && amountCol === undefined) {
    return null; // can't determine amounts
  }

  if (dateCol === -1) return null;

  return { dateCol, valueDateCol, descCol, debitCol, creditCol, amountCol, balanceCol, referenceCol };
}

// ─── Bank Presets ───────────────────────────────────────────

interface BankPresetConfig {
  name: string;
  headerMatch: RegExp;
  mapping: ColumnMapping;
}

const BANK_PRESETS: Record<string, BankPresetConfig> = {
  emirates_nbd: {
    name: 'Emirates NBD',
    headerMatch: /date.*value\s*date.*description.*debit.*credit.*balance/i,
    mapping: { dateCol: 0, valueDateCol: 1, descCol: 2, debitCol: 3, creditCol: 4, balanceCol: 5 },
  },
  adcb: {
    name: 'ADCB',
    headerMatch: /transaction\s*date.*description.*debit\s*amount.*credit\s*amount.*running\s*balance/i,
    mapping: { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, balanceCol: 4 },
  },
  fab: {
    name: 'First Abu Dhabi Bank',
    headerMatch: /date.*reference.*description.*amount.*balance/i,
    mapping: { dateCol: 0, referenceCol: 1, descCol: 2, amountCol: 3, balanceCol: 4 },
  },
  mashreq: {
    name: 'Mashreq Bank',
    headerMatch: /date.*narration.*dr\s*amount.*cr\s*amount.*balance/i,
    mapping: { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, balanceCol: 4 },
  },
  rakbank: {
    name: 'RAKBANK',
    headerMatch: /date.*description.*debit.*credit.*balance/i,
    mapping: { dateCol: 0, descCol: 1, debitCol: 2, creditCol: 3, balanceCol: 4 },
  },
};

/**
 * Detect bank preset from header row content.
 */
function detectBankPreset(headerLine: string): BankPreset {
  for (const [key, preset] of Object.entries(BANK_PRESETS)) {
    if (preset.headerMatch.test(headerLine)) {
      return key as BankPreset;
    }
  }
  return 'generic';
}

// ─── Summary / Footer Detection ─────────────────────────────

function isSummaryRow(fields: string[]): boolean {
  const joined = fields.join(' ').toLowerCase();
  // Common summary indicators
  if (joined.includes('total') || joined.includes('opening balance') ||
      joined.includes('closing balance') || joined.includes('statement period') ||
      joined.includes('account number') || joined.includes('generated on') ||
      joined.includes('page ') || joined.includes('end of statement')) {
    return true;
  }
  // Rows where most fields are empty
  const nonEmpty = fields.filter(f => f.trim() !== '');
  if (nonEmpty.length <= 1) return true;

  return false;
}

// ─── CSV Parser ─────────────────────────────────────────────

export function parseCSV(content: string, options?: CSVParseOptions): ParsedTransaction[] {
  if (!content || !content.trim()) return [];

  const delimiter = options?.delimiter || detectDelimiter(content);
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const fields = splitCSVLine(lines[i], delimiter);
    if (isHeaderRow(fields)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // No header found; try first row
    headerIdx = 0;
  }

  const headerFields = splitCSVLine(lines[headerIdx], delimiter);
  const headerLine = lines[headerIdx];

  // Determine bank preset and column mapping
  const preset = options?.bankPreset
    ? (options.bankPreset as BankPreset)
    : detectBankPreset(headerLine);

  let mapping: ColumnMapping | null;
  if (preset !== 'generic' && BANK_PRESETS[preset]) {
    mapping = BANK_PRESETS[preset].mapping;
  } else {
    mapping = detectColumns(headerFields);
  }

  if (!mapping) {
    // Fallback: unable to determine columns
    return [];
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitCSVLine(lines[i], delimiter);
    if (fields.length < 2) continue;
    if (isSummaryRow(fields)) continue;

    // Build raw data map
    const rawData: Record<string, string> = {};
    for (let j = 0; j < headerFields.length && j < fields.length; j++) {
      rawData[headerFields[j]] = fields[j];
    }

    // Parse date
    const dateStr = fields[mapping.dateCol] || '';
    const date = parseDate(dateStr, options?.dateFormat);
    if (!date) continue; // Skip rows without a valid date

    // Parse description
    const description = (fields[mapping.descCol] || '').trim();
    if (!description) continue; // Skip rows without description

    // Parse amount
    let amount: number;
    if (mapping.debitCol !== undefined && mapping.creditCol !== undefined) {
      // Separate debit/credit columns
      const debit = parseAmount(fields[mapping.debitCol]);
      const credit = parseAmount(fields[mapping.creditCol]);
      if (debit === 0 && credit === 0) continue; // no amount data
      amount = credit > 0 ? credit : -Math.abs(debit);
    } else if (mapping.amountCol !== undefined) {
      // Single amount column (negative = debit for FAB)
      amount = parseAmount(fields[mapping.amountCol]);
      if (amount === 0) continue;
    } else {
      continue;
    }

    // Parse balance
    const balance = mapping.balanceCol !== undefined
      ? parseAmount(fields[mapping.balanceCol]) || undefined
      : undefined;

    // Parse reference
    const reference = mapping.referenceCol !== undefined
      ? (fields[mapping.referenceCol] || '').trim() || undefined
      : undefined;

    transactions.push({
      date,
      description,
      amount,
      reference,
      balance: balance === 0 ? undefined : balance,
      rawData,
    });
  }

  return transactions;
}

// ─── OFX Parser ─────────────────────────────────────────────

/**
 * Parse OFX date format: YYYYMMDD or YYYYMMDDHHMMSS[.XXX]
 */
function parseOFXDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // YYYYMMDD or YYYYMMDDHHMMSS
  const match = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;

  const [, y, m, d] = match;
  return formatISODate(+y, +m, +d);
}

/**
 * Extract text content from an OFX/XML-like tag.
 */
function extractTag(content: string, tagName: string): string {
  // OFX can be SGML-style (no closing tags) or XML-style
  // Try XML first: <TAG>value</TAG>
  const xmlRegex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const xmlMatch = content.match(xmlRegex);
  if (xmlMatch) return xmlMatch[1].trim();

  // SGML-style: <TAG>value\n
  const sgmlRegex = new RegExp(`<${tagName}>([^\\n<]+)`, 'i');
  const sgmlMatch = content.match(sgmlRegex);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return '';
}

/**
 * Extract all text occurrences of a tag.
 */
function extractAllTags(content: string, tagName: string): string[] {
  const results: string[] = [];

  // XML-style
  const xmlRegex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = xmlRegex.exec(content)) !== null) {
    results.push(match[1].trim());
  }
  if (results.length > 0) return results;

  // SGML-style
  const sgmlRegex = new RegExp(`<${tagName}>([^\\n<]+)`, 'gi');
  while ((match = sgmlRegex.exec(content)) !== null) {
    results.push(match[1].trim());
  }

  return results;
}

export function parseOFX(content: string): ParsedTransaction[] {
  if (!content || !content.trim()) return [];

  const transactions: ParsedTransaction[] = [];

  // Split into individual transaction blocks
  // OFX uses <STMTTRN>...</STMTTRN> for each transaction
  const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>))/gi;
  let trnMatch: RegExpExecArray | null;

  while ((trnMatch = trnRegex.exec(content)) !== null) {
    const block = trnMatch[1];

    const dateRaw = extractTag(block, 'DTPOSTED');
    const date = parseOFXDate(dateRaw);
    if (!date) continue;

    const amountRaw = extractTag(block, 'TRNAMT');
    const amount = parseFloat(amountRaw);
    if (isNaN(amount)) continue;

    const name = extractTag(block, 'NAME');
    const memo = extractTag(block, 'MEMO');
    const fitId = extractTag(block, 'FITID');
    const checkNum = extractTag(block, 'CHECKNUM');
    const trnType = extractTag(block, 'TRNTYPE');

    const description = [name, memo].filter(Boolean).join(' - ') || trnType || 'Unknown';

    transactions.push({
      date,
      description,
      amount, // OFX amounts are already signed (positive=credit, negative=debit)
      reference: fitId || checkNum || undefined,
      rawData: {
        DTPOSTED: dateRaw,
        TRNAMT: amountRaw,
        NAME: name,
        MEMO: memo,
        FITID: fitId,
        CHECKNUM: checkNum,
        TRNTYPE: trnType,
      },
    });
  }

  return transactions;
}

// ─── Format Detection ───────────────────────────────────────

export function detectBankFormat(content: string): DetectResult {
  if (!content || !content.trim()) {
    return { format: 'csv' };
  }

  const trimmed = content.trim();

  // OFX detection: look for OFX/SGML markers
  if (
    trimmed.includes('<OFX>') || trimmed.includes('<OFX>') ||
    trimmed.includes('OFXHEADER:') ||
    trimmed.includes('<STMTTRN>') ||
    trimmed.includes('<BANKMSGSRSV1>')
  ) {
    return { format: 'ofx' };
  }

  // QIF detection (partial — treat as CSV for now)
  // QIF files start with !Type:
  if (trimmed.startsWith('!Type:')) {
    return { format: 'csv' }; // QIF not fully supported, user should convert
  }

  // It's a CSV — detect delimiter and bank preset
  const delimiter = detectDelimiter(content);
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  let bankPreset: BankPreset = 'generic';
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const fields = splitCSVLine(lines[i], delimiter);
    if (isHeaderRow(fields)) {
      bankPreset = detectBankPreset(lines[i]);
      break;
    }
  }

  return {
    format: 'csv',
    bankPreset,
    delimiter,
  };
}

import Papa from "papaparse";

/**
 * File acceptance & structural parse — §15.2. Every malformed input has a
 * defined outcome; whole-file rejections are typed errors.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DATA_ROWS = 50_000;

export type FileRejectCode =
  | "file_too_large"
  | "file_empty"
  | "file_binary"
  | "file_structure_undetectable"
  | "file_too_many_rows";

export class FileRejectError extends Error {
  constructor(
    public readonly code: FileRejectCode,
    message: string,
  ) {
    super(message);
  }
}

export type ParsedFile = {
  headers: string[];
  /** true when the first row parsed as data and synthetic col_1..n headers were used (§15.8-1) */
  syntheticHeaders: boolean;
  rows: string[][];
  delimiter: string;
  encoding: "utf-8" | "utf-8-bom" | "latin-1";
};

/** §15.2: UTF-8 / UTF-8-BOM / Latin-1 detected via BOM + heuristic. */
export function decodeBuffer(buf: Uint8Array): {
  text: string;
  encoding: ParsedFile["encoding"];
} {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(buf.subarray(3)),
      encoding: "utf-8-bom",
    };
  }
  const strict = new TextDecoder("utf-8", { fatal: true });
  try {
    return { text: strict.decode(buf), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("latin1").decode(buf), encoding: "latin-1" };
  }
}

function looksBinary(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, 4096);
  let control = 0;
  for (const b of sample) {
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return sample.length > 0 && control / sample.length > 0.05;
}

/** §15.2: candidate delimiters scored over first 50 lines; ties prefer comma. */
export function detectDelimiter(text: string): string | null {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0).slice(0, 50);
  if (lines.length === 0) return null;
  const candidates = [",", ";", "\t", "|"];
  let best: { delim: string; score: number; cols: number } | null = null;
  for (const delim of candidates) {
    const counts = lines.map(
      (l) => Papa.parse<string[]>(l, { delimiter: delim }).data[0]?.length ?? 1,
    );
    const mode = counts
      .sort((a, b) => a - b)
      [Math.floor(counts.length / 2)] as number;
    const consistent = counts.filter((c) => c === mode).length / counts.length;
    const score = mode >= 2 ? consistent : 0;
    if (
      best === null ||
      score > best.score ||
      (score === best.score && delim === "," && best.delim !== ",")
    ) {
      if (best === null || score >= best.score) best = { delim, score, cols: mode };
    }
  }
  if (!best || best.score === 0 || best.cols < 2) return null;
  return best.delim;
}

/** §15.8-2: Excel artifacts — ="0123" unwrapped, leading apostrophes, NA markers. */
export function cleanCell(value: string): string {
  let v = value.trim();
  const formulaMatch = /^="(.*)"$/.exec(v);
  if (formulaMatch) v = formulaMatch[1] ?? "";
  if (v.startsWith("'")) v = v.slice(1);
  if (v === "#N/A" || v === "NULL" || v === "N/A" || v === "-") v = "";
  return v;
}

/** Headerless detection (§15.8-1): header candidate parses as a valid data row. */
function rowLooksLikeData(row: string[]): boolean {
  const dateish = row.some((c) =>
    /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c.trim()),
  );
  const numericish = row.some((c) =>
    /^-?[$€£]?[\d,.]+\d$|^\(\s*[\d,.]+\s*\)$/.test(c.trim()),
  );
  return dateish && numericish;
}

export function parseFile(buf: Uint8Array): ParsedFile {
  if (buf.length > MAX_FILE_BYTES) {
    throw new FileRejectError(
      "file_too_large",
      `File exceeds the 10 MB limit (${(buf.length / 1024 / 1024).toFixed(1)} MB).`,
    );
  }
  if (looksBinary(buf)) {
    throw new FileRejectError("file_binary", "File appears to be binary, not CSV.");
  }
  const { text, encoding } = decodeBuffer(buf);
  if (text.trim() === "") {
    throw new FileRejectError("file_empty", "File contains no rows.");
  }
  const delimiter = detectDelimiter(text);
  if (!delimiter) {
    throw new FileRejectError(
      "file_structure_undetectable",
      "Could not detect a CSV structure (need at least 2 columns).",
    );
  }

  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: "greedy",
  });
  const allRows = parsed.data.filter((r) => r.length > 1 || (r[0] ?? "") !== "");
  if (allRows.length === 0) {
    throw new FileRejectError("file_empty", "File contains no rows.");
  }

  const first = (allRows[0] ?? []).map(cleanCell);
  const syntheticHeaders = rowLooksLikeData(first);
  const headers = syntheticHeaders
    ? first.map((_, i) => `col_${i + 1}`)
    : first;
  const dataRows = (syntheticHeaders ? allRows : allRows.slice(1)).map((r) =>
    r.map(cleanCell),
  );

  if (dataRows.length === 0) {
    throw new FileRejectError("file_empty", "File has headers but no data rows.");
  }
  if (dataRows.length > MAX_DATA_ROWS) {
    // §15.8-5: no silent truncation — count in the message.
    throw new FileRejectError(
      "file_too_many_rows",
      `File has ${dataRows.length.toLocaleString("en-US")} data rows; the limit is 50,000.`,
    );
  }

  return { headers, syntheticHeaders, rows: dataRows, delimiter, encoding };
}

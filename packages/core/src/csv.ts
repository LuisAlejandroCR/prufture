// csv.ts: the one rule for turning a value into a CSV cell, shared by the api's coordinator export
// and the dashboard's browser download. taskId comes from a self-signed (untrusted) payload, and a
// single shared rule stops a hardening fix from landing in one exporter and missing the other.

/**
 * Leading characters that make Excel, LibreOffice and Google Sheets treat a cell as a formula
 * rather than text. Tab, CR and LF count because the app strips leading whitespace and
 * re-reads what follows.
 */
const FORMULA_LEAD = /^[=+\-@\t\r\n]/;

/**
 * Neutralise spreadsheet formula injection by prefixing a single quote — the standard
 * mitigation. Spreadsheets then read the cell as text and do not display the quote.
 *
 * Quoting alone does NOT protect: a spreadsheet unquotes the cell first and then evaluates it.
 */
export function neutraliseFormula(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
}

/**
 * A complete CSV cell: formula-neutralised, then RFC 4180 escaped so a value containing a
 * comma, quote, CR or LF cannot break the row.
 */
export function csvCell(value: string): string {
  const safe = neutraliseFormula(value);
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

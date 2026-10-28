/**
 * One CSV cell. Text starting with = + - @ (or a tab / CR) is run as a formula by Excel and
 * Sheets, so an employee named "=HYPERLINK(...)" would execute on the payroll clerk's machine:
 * prefix it with ' so it stays text. Plain numbers ("-1.50") are left alone for payroll imports.
 */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

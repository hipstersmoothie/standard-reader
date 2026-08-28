/**
 * Pull unique, lowercased email addresses out of free text or CSV contents.
 * Tolerant on purpose — pasted lists and exported CSVs vary wildly in
 * delimiters and stray columns, so we match address-shaped tokens anywhere
 * rather than assuming a format.
 */
export function extractEmails(text: string): Array<string> {
  const found = text.match(/[^\s,;<>()"]+@[^\s,;<>()"]+\.[^\s,;<>()"]+/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

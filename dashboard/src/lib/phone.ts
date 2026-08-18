/**
 * The one place a phone number is cleaned up.
 *
 * `granola.ts` already carried this formatting for numbers pulled out of call
 * notes. Research entry needs exactly the same treatment, so the rule lives
 * here and both callers use it — a household typed in by hand and one read off
 * a transcript must end up stored identically, or duplicate detection stops
 * matching them.
 */

/** Everything that is not a digit, removed. */
export function phoneDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * A US number, or empty when the input is not one.
 *
 * Ten digits are required. A leading country code is tolerated because people
 * paste "+1 616 555 0142" from search results, but anything shorter is not a
 * number that can be dialled and is refused rather than stored half-formed.
 */
export function formatPhone(value: string): string {
  let digits = phoneDigits(value);
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Whether this text can become a dialable number. */
export function isValidPhone(value: string): boolean {
  return formatPhone(value) !== "";
}

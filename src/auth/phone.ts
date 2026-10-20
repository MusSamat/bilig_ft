/**
 * The national part of a Kyrgyz mobile number as the phone field shows it: the
 * field has a fixed «+996» prefix and keeps up to 9 digits, printed «555 12 34 56».
 * The contract (`normalizeKgPhone` / `PhoneSchema`) has the final word on validity.
 */
import { PhoneSchema } from '@bilig/content-model/api';

export const NATIONAL_DIGITS = 9;

/**
 * Digits for the field from whatever was typed, pasted or auto-filled: «+996 555 12-34-56»,
 * «996555123456» and «0555 123 456» all give «555123456». A leading 0 (the domestic trunk
 * prefix) is dropped as it is typed: no Kyrgyz mobile number starts with it.
 */
export function nationalDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('996')) d = d.slice(3);
  return d.replace(/^0+/, '').slice(0, NATIONAL_DIGITS);
}

/** «555123456» → «555 12 34 56» (partial input is grouped as far as it goes). */
export function formatNational(digits: string): string {
  const d = digits.slice(0, NATIONAL_DIGITS);
  return [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

/** The E.164 number for the API, or null while the input is not a valid Kyrgyz mobile number. */
export function toE164(digits: string): string | null {
  const r = PhoneSchema.safeParse(`+996${digits}`);
  return r.success && digits.length === NATIONAL_DIGITS ? r.data : null;
}

/** Field digits from an E.164 number (prefill from navigation state). */
export const digitsOfE164 = (e164: string | undefined): string => (e164 && /^\+996\d{9}$/.test(e164) ? e164.slice(4) : '');

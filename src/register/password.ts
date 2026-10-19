/** A rough, offline password strength hint (the server has the final word: length + leaked list). */
export const MIN_PASSWORD = 10;

export type Strength = 'empty' | 'short' | 'fair' | 'strong';

export function passwordStrength(pw: string): Strength {
  if (!pw) return 'empty';
  if ([...pw].length < MIN_PASSWORD) return 'short';
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(pw)).length;
  const distinct = new Set(pw.toLowerCase()).size;
  return ([...pw].length >= 14 && classes >= 2 && distinct >= 6) || (classes >= 3 && distinct >= 8) ? 'strong' : 'fair';
}

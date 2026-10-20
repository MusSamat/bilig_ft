import { describe, expect, it } from 'vitest';
import { PhoneSchema, formatKgPhone, normalizeKgPhone } from '@bilig/content-model/api';
import { digitsOfE164, formatNational, nationalDigits, toE164 } from './phone';

describe('phone field helpers (contract 0.7.0 numbers)', () => {
  it.each([
    ['555123456', '555123456'],
    ['555 12 34 56', '555123456'],
    ['0555 12-34-56', '555123456'],
    ['+996 555 12 34 56', '555123456'],
    ['996555123456', '555123456'],
    ['(0555) 123 456', '555123456'],
    ['5551234567890', '555123456'],
    ['0', ''],
    ['70', '70'],
  ])('nationalDigits(%j) = %j', (raw, digits) => {
    expect(nationalDigits(raw)).toBe(digits);
  });

  it('groups digits live as «555 12 34 56»', () => {
    expect(formatNational('5')).toBe('5');
    expect(formatNational('5551')).toBe('555 1');
    expect(formatNational('555123')).toBe('555 12 3');
    expect(formatNational('555123456')).toBe('555 12 34 56');
    expect(`+996 ${formatNational('555123456')}`).toBe(formatKgPhone('+996555123456'));
  });

  it('gives the E.164 number only for a complete number, agreeing with PhoneSchema', () => {
    expect(toE164('55512345')).toBeNull();
    expect(toE164('555123456')).toBe('+996555123456');
    expect(PhoneSchema.parse('0555 123 456')).toBe(toE164(nationalDigits('0555 123 456')));
    expect(normalizeKgPhone('+996 555 123 456')).toBe('+996555123456');
  });

  it('prefills from an E.164 number only', () => {
    expect(digitsOfE164('+996555000001')).toBe('555000001');
    expect(digitsOfE164('teacher@bilig.kg')).toBe('');
    expect(digitsOfE164(undefined)).toBe('');
  });
});

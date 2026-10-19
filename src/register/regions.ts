/**
 * Regions of Kyrgyzstan for the registration form (optional). The value sent as
 * `region` is this stable key; names are UI strings (`register.region.<key>`).
 */
export const REGIONS = ['bishkek', 'osh-city', 'batken', 'jalal-abad', 'issyk-kul', 'naryn', 'osh', 'talas', 'chui'] as const;
export type Region = (typeof REGIONS)[number];

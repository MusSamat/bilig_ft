/**
 * Regions of Kyrgyzstan for the school form. The value sent as `region` is this
 * stable key (the same keys as the registration form); names are UI strings
 * `teacher.region.<key>`.
 */
export const REGIONS = ['bishkek', 'osh-city', 'batken', 'jalal-abad', 'issyk-kul', 'naryn', 'osh', 'talas', 'chui'] as const;
export type Region = (typeof REGIONS)[number];
export const isRegion = (v: string | undefined): v is Region => !!v && (REGIONS as readonly string[]).includes(v);

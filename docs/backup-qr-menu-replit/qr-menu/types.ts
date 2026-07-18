// ── QR Menu — shared types ────────────────────────────────────────────────────

export type ThemeColors = {
  primary: string;
  background: string;
  accent: string;
  infoTextColor: string;
  categoryCardBg: string;
  categoryCardText: string;
  callButtonBg: string;
  callButtonText: string;
  scheduleButtonBg: string;
  scheduleButtonText: string;
  heroTitleColor: string;
  heroTaglineColor: string;
  heroEstablishedColor: string;
  tapDetailsColor: string;
};

export type EnabledColors = Partial<Record<keyof ThemeColors, boolean>>;

export type ThemeFonts = {
  heading: string;
  body: string;
  headingColor: string;
  bodyColor: string;
};

export type CardSettings = {
  showImage: boolean;
  showDescription: boolean;
  showTags: boolean;
  showAllergens: boolean;
  showPrice: boolean;
  showHalfPortion: boolean;
  showQuantity: boolean;
  layout: 'grid' | 'list' | 'compact';
};

export type Shift = {
  open: boolean;
  openTime: string;
  closeTime: string;
};

export type DaySchedule = {
  day: string;
  shift1: Shift;
  shift2: Shift;
};

export type QrBranding = {
  restaurantName: string;
  tagline: string;
  heroImageUrl: string;
  heroVideoUrl: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
  establishedYear: string;
  logoUrl: string;
  themeColors: ThemeColors | null;
  themeFonts: ThemeFonts | null;
  cardSettings: CardSettings | null;
  schedule: DaySchedule[] | null;
};

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: '#5c1f1f',
  background: '#faf8f4',
  accent: '#c8963e',
  infoTextColor: '#6b5a4a',
  categoryCardBg: '#ffffff',
  categoryCardText: '#2d1c0e',
  callButtonBg: '#5c1f1f',
  callButtonText: '#ffffff',
  scheduleButtonBg: '#f0ece4',
  scheduleButtonText: '#5c1f1f',
  heroTitleColor: '#ffffff',
  heroTaglineColor: '#ffffffb3',
  heroEstablishedColor: '#c8963e',
  tapDetailsColor: '#5c1f1f',
};

export const DEFAULT_ENABLED_COLORS: EnabledColors = {
  primary: true, background: true, accent: true,
  infoTextColor: true, categoryCardBg: true, categoryCardText: true,
  callButtonBg: true, callButtonText: true,
  scheduleButtonBg: true, scheduleButtonText: true,
  heroTitleColor: true, heroTaglineColor: true, heroEstablishedColor: true,
  tapDetailsColor: true,
};

export const DEFAULT_THEME_FONTS: ThemeFonts = {
  heading: 'Playfair Display',
  body: 'Lato',
  headingColor: '',
  bodyColor: '',
};

export const DEFAULT_CARD_SETTINGS: CardSettings = {
  showImage: true,
  showDescription: true,
  showTags: true,
  showAllergens: true,
  showPrice: true,
  showHalfPortion: true,
  showQuantity: true,
  layout: 'grid',
};

export const DEFAULT_SCHEDULE: DaySchedule[] = [
  { day: 'monday',    shift1: { open: true,  openTime: '13:00', closeTime: '16:00' }, shift2: { open: true,  openTime: '20:00', closeTime: '23:30' } },
  { day: 'tuesday',   shift1: { open: true,  openTime: '13:00', closeTime: '16:00' }, shift2: { open: true,  openTime: '20:00', closeTime: '23:30' } },
  { day: 'wednesday', shift1: { open: true,  openTime: '13:00', closeTime: '16:00' }, shift2: { open: true,  openTime: '20:00', closeTime: '23:30' } },
  { day: 'thursday',  shift1: { open: true,  openTime: '13:00', closeTime: '16:00' }, shift2: { open: true,  openTime: '20:00', closeTime: '23:30' } },
  { day: 'friday',    shift1: { open: true,  openTime: '13:00', closeTime: '16:00' }, shift2: { open: true,  openTime: '20:00', closeTime: '00:00' } },
  { day: 'saturday',  shift1: { open: true,  openTime: '13:00', closeTime: '16:30' }, shift2: { open: true,  openTime: '20:00', closeTime: '00:00' } },
  { day: 'sunday',    shift1: { open: true,  openTime: '13:00', closeTime: '16:30' }, shift2: { open: false, openTime: '20:00', closeTime: '23:00' } },
];

export const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'de', 'ca', 'it', 'nl', 'ro'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch',
  ca: 'Català', it: 'Italiano', nl: 'Nederlands', ro: 'Română',
};

export const COLOR_PRESETS = [
  {
    label: 'Burdeos',
    colors: {
      primary: '#5c1f1f', background: '#faf8f4', accent: '#c8963e',
      infoTextColor: '#6b5a4a', categoryCardBg: '#ffffff', categoryCardText: '#2d1c0e',
      callButtonBg: '#5c1f1f', callButtonText: '#ffffff',
      scheduleButtonBg: '#f0ece4', scheduleButtonText: '#5c1f1f',
      heroTitleColor: '#ffffff', heroTaglineColor: '#ffffffb3', heroEstablishedColor: '#c8963e',
      tapDetailsColor: '#5c1f1f',
    } as ThemeColors,
  },
  {
    label: 'Verde',
    colors: {
      primary: '#1e4d2b', background: '#f5f9f4', accent: '#8ab87a',
      infoTextColor: '#4a6650', categoryCardBg: '#ffffff', categoryCardText: '#1a2d1e',
      callButtonBg: '#1e4d2b', callButtonText: '#ffffff',
      scheduleButtonBg: '#e8f0e9', scheduleButtonText: '#1e4d2b',
      heroTitleColor: '#ffffff', heroTaglineColor: '#ffffffb3', heroEstablishedColor: '#8ab87a',
      tapDetailsColor: '#1e4d2b',
    } as ThemeColors,
  },
  {
    label: 'Azul marino',
    colors: {
      primary: '#1a2e4a', background: '#f4f7fa', accent: '#5b8fc9',
      infoTextColor: '#3a5470', categoryCardBg: '#ffffff', categoryCardText: '#1a2e4a',
      callButtonBg: '#1a2e4a', callButtonText: '#ffffff',
      scheduleButtonBg: '#e6edf5', scheduleButtonText: '#1a2e4a',
      heroTitleColor: '#ffffff', heroTaglineColor: '#ffffffb3', heroEstablishedColor: '#5b8fc9',
      tapDetailsColor: '#1a2e4a',
    } as ThemeColors,
  },
  {
    label: 'Negro elegante',
    colors: {
      primary: '#1a1a1a', background: '#f9f7f5', accent: '#c9a84c',
      infoTextColor: '#555555', categoryCardBg: '#ffffff', categoryCardText: '#1a1a1a',
      callButtonBg: '#1a1a1a', callButtonText: '#ffffff',
      scheduleButtonBg: '#eeeeee', scheduleButtonText: '#1a1a1a',
      heroTitleColor: '#ffffff', heroTaglineColor: '#ffffffb3', heroEstablishedColor: '#c9a84c',
      tapDetailsColor: '#1a1a1a',
    } as ThemeColors,
  },
  {
    label: 'Terracota',
    colors: {
      primary: '#8b3a1e', background: '#fdf5ee', accent: '#d4a96a',
      infoTextColor: '#7a5040', categoryCardBg: '#ffffff', categoryCardText: '#3d1a0a',
      callButtonBg: '#8b3a1e', callButtonText: '#ffffff',
      scheduleButtonBg: '#f5e8de', scheduleButtonText: '#8b3a1e',
      heroTitleColor: '#ffffff', heroTaglineColor: '#ffffffb3', heroEstablishedColor: '#d4a96a',
      tapDetailsColor: '#8b3a1e',
    } as ThemeColors,
  },
  {
    label: 'Lila',
    colors: {
      primary: '#5b3572', background: '#faf8fd', accent: '#b38fd4',
      infoTextColor: '#6b5080', categoryCardBg: '#ffffff', categoryCardText: '#2d1845',
      callButtonBg: '#5b3572', callButtonText: '#ffffff',
      scheduleButtonBg: '#ede5f5', scheduleButtonText: '#5b3572',
      heroTitleColor: '#ffffff', heroTaglineColor: '#ffffffb3', heroEstablishedColor: '#b38fd4',
      tapDetailsColor: '#5b3572',
    } as ThemeColors,
  },
];

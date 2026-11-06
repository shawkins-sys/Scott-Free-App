// Scott Free: app-wide settings.
// Only the Supabase URL and anon key may ever go here. Never add other secrets:
// this repo is public.

export const CONFIG = {
  appName: 'Scott Free',
  ownerName: 'Scott',
  timezone: 'Europe/London',
  locale: 'en-GB',
  currency: 'GBP',

  // Screens narrower than this (in CSS pixels) use the phone layout.
  phoneBreakpoint: 768,

  // Filled in during Supabase setup (see docs/SUPABASE-SETUP.md).
  supabaseUrl: 'https://fkcnfgevtwemgokrjxrk.supabase.co',
  supabaseAnonKey: 'sb_publishable_Br7GyAuvgd0h8Mcud82-RA_RoEcKBO4',

  // Google OAuth client ID for the Photos Picker (see docs/GOOGLE-PHOTOS-SETUP.md).
  // A client ID is public by design and safe to commit. Never add a client secret.
  googleClientId: '',
};

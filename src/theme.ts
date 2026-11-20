import type { GameEdition } from './games/next-stop/types';

/**
 * NEXT STOP master theme: a strict 4-colour system.
 *   Charcoal  #1E1E24 — backgrounds, outlines, night sky, track
 *   Amber     #FFB000 — THE signature colour (departure-board glow)
 *   Cream     #F2EBDD — text, platforms, carriages, signage
 *   Signal red #D7263D — accents only (Europe swaps this for blue #1F4EA8)
 * Only tints/shades of these four are allowed anywhere (UI + 3D).
 */
export const THEME = {
  charcoal: '#1e1e24',
  charcoalDeep: '#0e0e12',
  charcoalDark: '#16161b',
  charcoalMid: '#2e2e37',
  charcoalLight: '#44444f',
  amber: '#ffb000',
  amberLight: '#ffd27a',
  amberDark: '#a86f00',
  amberDeep: '#5c3c00',
  cream: '#f2ebdd',
  creamDim: '#c9c1b2',
  creamMuted: '#8a8478',
  red: '#d72638',
  redDark: '#8e1828',
  blue: '#1f4ea8',
  blueDark: '#142f66',
} as const;

export function accentFor(edition: GameEdition): { accent: string; accentDark: string } {
  return edition === 'next-stop-europe'
    ? { accent: THEME.blue, accentDark: THEME.blueDark }
    : { accent: THEME.red, accentDark: THEME.redDark };
}

/** Every pixel of the 3D view is snapped to one of these (with ordered dithering). */
export function scenePaletteFor(edition: GameEdition): string[] {
  const { accent, accentDark } = accentFor(edition);
  return [
    THEME.charcoalDeep,
    THEME.charcoal,
    THEME.charcoalMid,
    THEME.charcoalLight,
    THEME.amberDeep,
    THEME.amberDark,
    THEME.amber,
    THEME.amberLight,
    THEME.creamMuted,
    THEME.creamDim,
    THEME.cream,
    accentDark,
    accent,
    // Tier train colours and extra greys so the scene stays bright and colourful.
    '#e5484d',
    '#8e1828',
    '#9d6bff',
    '#5b3a9e',
    '#7cc8f0',
    '#3b7ea8',
    '#a8a49a',
    '#5a5a62',
    '#6e6e78',
  ];
}

/** Sets the CSS accent variables used by the UI (red for UK, blue for Europe). */
export function applyEditionTheme(edition: GameEdition) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.edition =
    edition === 'next-stop-europe' ? 'europe' : 'uk';
}

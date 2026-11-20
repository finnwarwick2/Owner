import type { GameEdition } from './types';

export type BiomeId =
  | 'countryside'
  | 'towns'
  | 'coast'
  | 'mountains'
  | 'snow'
  | 'terminus'
  | 'eu_channel'
  | 'eu_france'
  | 'eu_med'
  | 'eu_alpine'
  | 'eu_central'
  | 'eu_nordic';

export interface BiomeConfig {
  id: BiomeId;
  name: string;
  minStation: number;
  maxStation: number;
  skyHex: string;
  fogHex: string;
  groundHex: string;
  hillHex: string;
  accentHex: string;
  treeColorHex: string;
  snowyTrees?: boolean;
}

export interface StationInfo {
  index: number; // 0..40
  name: string;
  regionTag: string;
  biomeId: BiomeId;
}

export const MAINLINE_BIOMES: BiomeConfig[] = [
  {
    id: 'countryside',
    name: 'Shire Countryside',
    minStation: 0,
    maxStation: 7,
    skyHex: '#6eb5e5',
    fogHex: '#9fd0ec',
    groundHex: '#4f8f3c',
    hillHex: '#3b732e',
    accentHex: '#d9a441',
    treeColorHex: '#2e6f34',
  },
  {
    id: 'towns',
    name: 'Brick Towns',
    minStation: 8,
    maxStation: 15,
    skyHex: '#84a9d9',
    fogHex: '#b2c6de',
    groundHex: '#6c727e',
    hillHex: '#924b3a',
    accentHex: '#d97736',
    treeColorHex: '#3f7d43',
  },
  {
    id: 'coast',
    name: 'Chalk Coast',
    minStation: 16,
    maxStation: 23,
    skyHex: '#5ec3e8',
    fogHex: '#a5e1f5',
    groundHex: '#d6c89e',
    hillHex: '#1f7aa8',
    accentHex: '#f8fafc',
    treeColorHex: '#3e8050',
  },
  {
    id: 'mountains',
    name: 'Granite Peaks',
    minStation: 24,
    maxStation: 31,
    skyHex: '#798bb8',
    fogHex: '#9da9c9',
    groundHex: '#5a6354',
    hillHex: '#4f5766',
    accentHex: '#2f5d3e',
    treeColorHex: '#264d36',
  },
  {
    id: 'snow',
    name: 'Highland Snow',
    minStation: 32,
    maxStation: 37,
    skyHex: '#3c5385',
    fogHex: '#b8d1eb',
    groundHex: '#dde9f4',
    hillHex: '#95b2d4',
    accentHex: '#38bdf8',
    treeColorHex: '#dbeafe',
    snowyTrees: true,
  },
  {
    id: 'terminus',
    name: 'Grand Terminus',
    minStation: 38,
    maxStation: 40,
    skyHex: '#2a224d',
    fogHex: '#59427d',
    groundHex: '#474354',
    hillHex: '#73578c',
    accentHex: '#facc15',
    treeColorHex: '#384664',
  },
];

const MAINLINE_STATION_NAMES: string[] = [
  'Waterloo Wharf',
  'Vauxhall Viaduct',
  'Clapham Crossing',
  'Surbiton Sidings',
  'Woking Woods',
  'Guildford Green',
  'Haslemere Heath',
  'Bramble Bridge',
  'Winchester Water',
  'Basingstoke Barns',
  'Reading Rise',
  'Didcot Dale',
  'Swindon Spires',
  'Marlborough Meadow',
  'Bath Brook',
  'Bristol Bay',
  'Weston Wells',
  'Exeter Elms',
  'Dawlish Dunes',
  'Teignmouth Tor',
  'Torquay Terrace',
  'Paignton Pier',
  'Penzance Point',
  'Truro Tides',
  'Shrewsbury Shire',
  'Hereford Hollow',
  'Abergavenny Arches',
  'Crickhowell Crags',
  'Buxton Bluffs',
  'Bakewell Barrow',
  'Settle Summit',
  'Ribblehead Ridge',
  'Carlisle Castle',
  'Lockerbie Loch',
  'Aviemore Alders',
  'Fort William Falls',
  'Inverness Inlet',
  'Wick Waters',
  'Edinburgh Esplanade',
  'York Yards',
  'Tilbury Terminus',
];

export const EUROPE_BIOMES: BiomeConfig[] = [
  {
    id: 'eu_channel',
    name: 'Channel & Lowlands',
    minStation: 0,
    maxStation: 6,
    skyHex: '#6fa8dc',
    fogHex: '#a4c7e8',
    groundHex: '#4e8a47',
    hillHex: '#365e4c',
    accentHex: '#f59e0b',
    treeColorHex: '#2f6b3a',
  },
  {
    id: 'eu_france',
    name: 'French Vineyards',
    minStation: 7,
    maxStation: 13,
    skyHex: '#7ec0ee',
    fogHex: '#b9ddf4',
    groundHex: '#84994f',
    hillHex: '#63753b',
    accentHex: '#eab308',
    treeColorHex: '#4d7a36',
  },
  {
    id: 'eu_med',
    name: 'Mediterranean Riviera',
    minStation: 14,
    maxStation: 20,
    skyHex: '#38bdf8',
    fogHex: '#9ee4fb',
    groundHex: '#dfc996',
    hillHex: '#0284c7',
    accentHex: '#f97316',
    treeColorHex: '#3d7a47',
  },
  {
    id: 'eu_alpine',
    name: 'Alpine Passes',
    minStation: 21,
    maxStation: 27,
    skyHex: '#48689e',
    fogHex: '#c2d8f0',
    groundHex: '#dce8f5',
    hillHex: '#7b97b8',
    accentHex: '#38bdf8',
    treeColorHex: '#d9ebff',
    snowyTrees: true,
  },
  {
    id: 'eu_central',
    name: 'Central Capitals',
    minStation: 28,
    maxStation: 33,
    skyHex: '#6c84b5',
    fogHex: '#9eb0d4',
    groundHex: '#5c6b58',
    hillHex: '#7c4d3e',
    accentHex: '#facc15',
    treeColorHex: '#32613b',
  },
  {
    id: 'eu_nordic',
    name: 'Nordic Fjords',
    minStation: 34,
    maxStation: 40,
    skyHex: '#283c6b',
    fogHex: '#5c7aa8',
    groundHex: '#426b6e',
    hillHex: '#2e4963',
    accentHex: '#22d3ee',
    treeColorHex: '#1f4f46',
  },
];

const EUROPE_STATION_LIST: Array<{ name: string; country: string }> = [
  { name: 'London St Pancras', country: 'UK' },
  { name: 'Ashford Intl', country: 'UK' },
  { name: 'Calais Ville', country: 'FR' },
  { name: 'Lille Europe', country: 'FR' },
  { name: 'Brussels Midi', country: 'BE' },
  { name: 'Antwerp Central', country: 'BE' },
  { name: 'Rotterdam', country: 'NL' },
  { name: 'Paris Gare du Nord', country: 'FR' },
  { name: 'Dijon Ville', country: 'FR' },
  { name: 'Lyon Part-Dieu', country: 'FR' },
  { name: 'Valence TGV', country: 'FR' },
  { name: 'Avignon Centre', country: 'FR' },
  { name: 'Marseille St-Charles', country: 'FR' },
  { name: 'Toulon', country: 'FR' },
  { name: 'Nice Ville', country: 'FR' },
  { name: 'Monaco Monte-Carlo', country: 'MC' },
  { name: 'Ventimiglia', country: 'IT' },
  { name: 'Genoa Piazza Principe', country: 'IT' },
  { name: 'Pisa Centrale', country: 'IT' },
  { name: 'Florence SMN', country: 'IT' },
  { name: 'Bologna Centrale', country: 'IT' },
  { name: 'Milan Centrale', country: 'IT' },
  { name: 'Como San Giovanni', country: 'IT' },
  { name: 'Lugano', country: 'CH' },
  { name: 'Zurich HB', country: 'CH' },
  { name: 'Sargans', country: 'CH' },
  { name: 'Innsbruck Hbf', country: 'AT' },
  { name: 'Brenner Pass', country: 'AT' },
  { name: 'Salzburg Hbf', country: 'AT' },
  { name: 'Munich Hbf', country: 'DE' },
  { name: 'Vienna Hbf', country: 'AT' },
  { name: 'Budapest Keleti', country: 'HU' },
  { name: 'Prague Hlavni', country: 'CZ' },
  { name: 'Berlin Hbf', country: 'DE' },
  { name: 'Hamburg Hbf', country: 'DE' },
  { name: 'Aarhus H', country: 'DK' },
  { name: 'Copenhagen Central', country: 'DK' },
  { name: 'Malmo Central', country: 'SE' },
  { name: 'Gothenburg Central', country: 'SE' },
  { name: 'Oslo Sentral', country: 'NO' },
  { name: 'Stockholm Central', country: 'SE' },
];

export const MAINLINE_STATIONS: StationInfo[] = MAINLINE_STATION_NAMES.map(
  (name, index) => {
    const biome =
      MAINLINE_BIOMES.find(
        (b) => index >= b.minStation && index <= b.maxStation,
      ) ?? MAINLINE_BIOMES[0];
    return {
      index,
      name,
      regionTag: biome.name,
      biomeId: biome.id,
    };
  },
);

export const EUROPE_STATIONS: StationInfo[] = EUROPE_STATION_LIST.map(
  (entry, index) => {
    const biome =
      EUROPE_BIOMES.find(
        (b) => index >= b.minStation && index <= b.maxStation,
      ) ?? EUROPE_BIOMES[0];
    return {
      index,
      name: entry.name,
      regionTag: `${entry.country} · ${biome.name}`,
      biomeId: biome.id,
    };
  },
);

// ── Strict-palette scenery overrides ─────────────────────────────────────
// Every region is a night/dusk scene built only from charcoal, amber, cream
// and the edition accent (red for the UK line, blue for Europe).
type ThemedColours = Pick<
  BiomeConfig,
  'skyHex' | 'fogHex' | 'groundHex' | 'hillHex' | 'accentHex' | 'treeColorHex'
>;
const NIGHT: ThemedColours = { skyHex: '#1e1e24', fogHex: '#2e2e37', groundHex: '#2e2e37', hillHex: '#26262e', accentHex: '#ffb000', treeColorHex: '#44444f' };
const DUSK: ThemedColours = { skyHex: '#5c3c00', fogHex: '#a86f00', groundHex: '#26262e', hillHex: '#16161b', accentHex: '#ffb000', treeColorHex: '#1e1e24' };
const SHORE: ThemedColours = { skyHex: '#16161b', fogHex: '#44444f', groundHex: '#8a8478', hillHex: '#2e2e37', accentHex: '#f2ebdd', treeColorHex: '#2e2e37' };
const PEAKS: ThemedColours = { skyHex: '#2e2e37', fogHex: '#44444f', groundHex: '#26262e', hillHex: '#44444f', accentHex: '#ffb000', treeColorHex: '#16161b' };
const SNOW: ThemedColours = { skyHex: '#44444f', fogHex: '#8a8478', groundHex: '#f2ebdd', hillHex: '#c9c1b2', accentHex: '#ffb000', treeColorHex: '#c9c1b2' };
const FINALE_UK: ThemedColours = { skyHex: '#0e0e12', fogHex: '#8e1828', groundHex: '#2e2e37', hillHex: '#1e1e24', accentHex: '#d72638', treeColorHex: '#2e2e37' };
const FINALE_EU: ThemedColours = { skyHex: '#0e0e12', fogHex: '#142f66', groundHex: '#2e2e37', hillHex: '#1e1e24', accentHex: '#1f4ea8', treeColorHex: '#2e2e37' };

const THEMED_BIOMES: Record<BiomeId, ThemedColours> = {
  countryside: NIGHT,
  towns: DUSK,
  coast: SHORE,
  mountains: PEAKS,
  snow: SNOW,
  terminus: FINALE_UK,
  eu_channel: NIGHT,
  eu_france: DUSK,
  eu_med: SHORE,
  eu_alpine: SNOW,
  eu_central: PEAKS,
  eu_nordic: FINALE_EU,
};
for (const b of [...MAINLINE_BIOMES, ...EUROPE_BIOMES]) {
  Object.assign(b, THEMED_BIOMES[b.id]);
}

export function getRouteStations(edition: GameEdition): StationInfo[] {
  return edition === 'next-stop-europe' ? EUROPE_STATIONS : MAINLINE_STATIONS;
}

export function getRouteBiomes(edition: GameEdition): BiomeConfig[] {
  return edition === 'next-stop-europe' ? EUROPE_BIOMES : MAINLINE_BIOMES;
}

export function getStationInfo(
  edition: GameEdition,
  index: number,
  loop: boolean = false,
): StationInfo {
  const list = getRouteStations(edition);
  const rounded = Math.max(0, Math.round(index));
  if (loop) {
    const wrapped = rounded % list.length;
    return {
      ...list[wrapped],
      index: rounded,
    };
  }
  const clamped = Math.min(list.length - 1, rounded);
  return list[clamped];
}

export function getBiomeForStation(
  edition: GameEdition,
  index: number,
  loop: boolean = false,
): BiomeConfig {
  const biomes = getRouteBiomes(edition);
  const rounded = Math.max(0, Math.round(index));
  const target = loop ? rounded % 41 : Math.min(40, rounded);
  for (let i = biomes.length - 1; i >= 0; i--) {
    if (target >= biomes[i].minStation) {
      return biomes[i];
    }
  }
  return biomes[0];
}

export interface CareerMilestone {
  score: number;
  station: string;
  region: string;
}

export const CAREER_LINE_MILESTONES: CareerMilestone[] = [
  { score: 0, station: 'Waterloo Depot', region: 'London' },
  { score: 150, station: 'Brighton Pier', region: 'Sussex Coast' },
  { score: 400, station: 'Channel Portal', region: 'Dover Strait' },
  { score: 800, station: 'Gare du Nord', region: 'Paris' },
  { score: 1300, station: 'Gotthard Crest', region: 'Swiss Alps' },
  { score: 2000, station: 'Haydarpasa', region: 'Istanbul' },
  { score: 3500, station: 'Samarkand Junction', region: 'Silk Road' },
  { score: 6000, station: 'Baikal Loop', region: 'Siberia' },
  { score: 9000, station: 'Shinjuku Terminus', region: 'Tokyo' },
];

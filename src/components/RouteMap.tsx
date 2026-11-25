import React, { useId, useMemo } from 'react';
import { getRouteBiomes } from '../games/next-stop/routes';
import {
  MAX_DAILY_STATIONS,
  TIER_COLORS,
  type GameEdition,
  type RarityTier,
} from '../games/next-stop/types';
import type { BiomeId } from '../games/next-stop/routes';

export interface RouteLeg {
  from: number;
  to: number;
  tier: RarityTier;
}

interface RouteMapProps {
  edition: GameEdition;
  /** Finished legs of today's journey, one per answered question. */
  legs: RouteLeg[];
  /** Live train position in stations (0–40), including mid-ride. */
  position: number;
  /** Colour of the train currently on the map. */
  trainTier: RarityTier;
  questionNumber: number;
  totalQuestions: number;
  expanded: boolean;
}

// ── The line: a railway winding up the parchment from bottom to top ──
const W = 300;
const H = 400;
const SAMPLES = 360;

type Pt = { x: number; y: number };

const ROUTE: Pt[] = Array.from({ length: SAMPLES + 1 }, (_, i) => {
  const t = i / SAMPLES;
  const sway = Math.sin(t * Math.PI * 3.2 + 0.35) * (0.82 + 0.18 * Math.cos(t * 9));
  return { x: W / 2 + sway * 98, y: 366 - t * 330 };
});
const CUM: number[] = (() => {
  const out = [0];
  for (let i = 1; i < ROUTE.length; i++) {
    out.push(out[i - 1] + Math.hypot(ROUTE[i].x - ROUTE[i - 1].x, ROUTE[i].y - ROUTE[i - 1].y));
  }
  return out;
})();
const TOTAL = CUM[CUM.length - 1];

function pointAt(station: number): Pt & { angle: number } {
  const target = (Math.max(0, Math.min(MAX_DAILY_STATIONS, station)) / MAX_DAILY_STATIONS) * TOTAL;
  let i = 1;
  while (i < CUM.length - 1 && CUM[i] < target) i++;
  const a = ROUTE[i - 1];
  const b = ROUTE[i];
  const f = (target - CUM[i - 1]) / Math.max(1e-6, CUM[i] - CUM[i - 1]);
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
  };
}

function polyline(from: number, to: number): string {
  if (to <= from) return '';
  const a = (from / MAX_DAILY_STATIONS) * TOTAL;
  const b = (Math.min(MAX_DAILY_STATIONS, to) / MAX_DAILY_STATIONS) * TOTAL;
  const pts: Pt[] = [pointAt(from)];
  for (let i = 0; i < ROUTE.length; i++) if (CUM[i] > a && CUM[i] < b) pts.push(ROUTE[i]);
  pts.push(pointAt(to));
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

const FULL_ROUTE = ROUTE.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

// ── Scenery sketched around the line, one style per region ──
type Prop = { x: number; y: number; s: number };

function seeded(seed: number) {
  let v = seed >>> 0 || 1;
  return () => {
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
    return v / 4294967296;
  };
}

function propsForBand(minStation: number, maxStation: number, seed: number): Prop[] {
  const rand = seeded(seed);
  const yTop = pointAt(maxStation).y;
  const yBot = pointAt(minStation).y;
  const out: Prop[] = [];
  for (let tries = 0; tries < 160 && out.length < 11; tries++) {
    const x = 18 + rand() * (W - 36);
    const y = yTop + rand() * Math.max(8, yBot - yTop);
    const nearTrack = ROUTE.some((p) => Math.hypot(p.x - x, p.y - y) < 17);
    const crowded = out.some((p) => Math.hypot(p.x - x, p.y - y) < 20);
    if (!nearTrack && !crowded) out.push({ x, y, s: 0.8 + rand() * 0.5 });
  }
  return out;
}

const PAL = {
  sketch: '#a8946a',
  land: '#9fcf72',
  landEdge: '#7cb357',
  tree: '#2f7d32',
  treeLight: '#5cb85c',
  roof: '#c8403a',
  wall: '#f6efe2',
  water: '#5aa9e6',
  rock: '#8b8f98',
  snow: '#ffffff',
  sand: '#e9d79f',
};

function Prop({ biome, p, colour }: { biome: BiomeId; p: Prop; colour: boolean }) {
  const k = p.s;
  const sk = PAL.sketch;
  switch (biome) {
    case 'countryside':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <rect x={-0.8} y={0} width={1.6} height={4} fill={colour ? '#6b4423' : sk} />
          <circle cx={0} cy={-2} r={4.2} fill={colour ? PAL.treeLight : 'none'} stroke={colour ? PAL.tree : sk} strokeWidth={1} />
        </g>
      );
    case 'desert':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`} fill={colour ? '#3f7f45' : 'none'} stroke={colour ? '#2a5e34' : sk} strokeWidth={0.9} strokeLinejoin="round">
          <path d="M-1.2 5 V-6 Q0 -7.5 1.2 -6 V5 Z" />
          <path d="M-1.2 0 H-3.6 V-3.5 Q-3 -4.6 -2.4 -3.5 V-1.2 H-1.2" />
          <path d="M1.2 1.5 H3.4 V-1.8 Q4 -2.9 4.6 -1.8 V2.7 H1.2" />
        </g>
      );
    case 'city':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <rect x={-3} y={-9} width={6} height={13} fill={colour ? '#4a3f66' : 'none'} stroke={colour ? '#2a2140' : sk} strokeWidth={0.9} />
          <rect x={3} y={-4} width={4} height={8} fill={colour ? '#5a4f73' : 'none'} stroke={colour ? '#2a2140' : sk} strokeWidth={0.9} />
          {colour && (
            <g fill="#ffd27a">
              <rect x={-1.8} y={-7} width={1.2} height={1.2} /><rect x={0.6} y={-4} width={1.2} height={1.2} /><rect x={-1.8} y={-1} width={1.2} height={1.2} /><rect x={4.4} y={-2} width={1.2} height={1.2} />
            </g>
          )}
        </g>
      );
    case 'towns':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <rect x={-4} y={-3} width={8} height={6} fill={colour ? PAL.wall : 'none'} stroke={colour ? '#6b4423' : sk} strokeWidth={0.9} />
          <path d="M-5 -3 L0 -7 L5 -3 Z" fill={colour ? PAL.roof : 'none'} stroke={colour ? PAL.roof : sk} strokeWidth={0.9} />
        </g>
      );
    case 'coast':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`} fill="none" stroke={colour ? PAL.water : sk} strokeWidth={1.1} strokeLinecap="round">
          <path d="M-6 0 q1.5 -2 3 0 t3 0 t3 0 t3 0" />
          <path d="M-4 3.5 q1.5 -2 3 0 t3 0 t3 0" />
        </g>
      );
    case 'mountains':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <path d="M-7 4 L0 -7 L7 4 Z" fill={colour ? PAL.rock : 'none'} stroke={colour ? '#5d6169' : sk} strokeWidth={0.9} />
          <path d="M-2.2 -3.5 L0 -7 L2.2 -3.5 Z" fill={colour ? PAL.snow : 'none'} stroke={colour ? 'none' : sk} strokeWidth={0.6} />
        </g>
      );
    case 'snow':
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <path d="M-5 4 L0 -6 L5 4 Z" fill={colour ? '#e8f2fb' : 'none'} stroke={colour ? '#9fb3c8' : sk} strokeWidth={0.9} />
          <path d="M0 -3 L-3 2 L3 2 Z" fill={colour ? '#1f5e3a' : 'none'} stroke={colour ? 'none' : sk} strokeWidth={0.6} />
        </g>
      );
    default:
      return (
        <g transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <rect x={-5} y={-2} width={10} height={6} fill={colour ? PAL.wall : 'none'} stroke={colour ? '#6b4423' : sk} strokeWidth={0.9} />
          <path d="M-6 -2 Q0 -8 6 -2 Z" fill={colour ? '#8a8a94' : 'none'} stroke={colour ? '#5d6169' : sk} strokeWidth={0.9} />
        </g>
      );
  }
}

/**
 * A parchment route map of today's line. Land you've travelled through turns
 * green and colourful; each answer's stretch of track is drawn in that
 * answer's train colour, and the train rides along it live.
 */
export const RouteMap: React.FC<RouteMapProps> = ({
  edition,
  legs,
  position,
  trainTier,
  questionNumber,
  totalQuestions,
  expanded,
}) => {
  const uid = useId().replace(/:/g, '');
  const biomes = getRouteBiomes(edition);

  const bands = useMemo(
    () =>
      biomes.map((b, i) => {
        const mid = pointAt((b.minStation + b.maxStation) / 2);
        return {
          biome: b,
          props: propsForBand(b.minStation, b.maxStation, 97 + i * 131),
          label: { x: mid.x > W / 2 ? 16 : W - 16, y: mid.y, anchor: mid.x > W / 2 ? 'start' : 'end' },
        };
      }),
    [biomes],
  );

  const pos = Math.max(0, Math.min(MAX_DAILY_STATIONS, position));
  const train = pointAt(pos);
  const travelled = polyline(0, pos);
  const pct = Math.round((pos / MAX_DAILY_STATIONS) * 100);
  const left = MAX_DAILY_STATIONS - Math.round(pos);
  const start = pointAt(0);
  const end = pointAt(MAX_DAILY_STATIONS);

  return (
    <div
      className={`route-map ${expanded ? 'route-map-expanded' : ''}`}
      data-testid="route-map"
      aria-label={`Question ${questionNumber} of ${totalQuestions}. Station ${Math.round(pos)} of ${MAX_DAILY_STATIONS}, ${pct}% of the way.`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img">
        <defs>
          <mask id={`reveal-${uid}`}>
            <rect width={W} height={H} fill="black" />
            {travelled && (
              <polyline points={travelled} fill="none" stroke="white" strokeWidth={74} strokeLinecap="round" strokeLinejoin="round" />
            )}
            <circle cx={start.x} cy={start.y} r={34} fill="white" />
          </mask>
          <pattern id={`grain-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#ead9b0" />
            <rect x="1" y="2" width="1" height="1" fill="#d9c493" />
            <rect x="4" y="4" width="1" height="1" fill="#e2cfa2" />
          </pattern>
        </defs>

        {/* Parchment */}
        <rect width={W} height={H} fill={`url(#grain-${uid})`} />
        <rect x={7} y={7} width={W - 14} height={H - 14} fill="none" stroke="#4a3b22" strokeWidth={2} />

        {/* Unexplored: faint sketches */}
        <g opacity={0.55}>
          {bands.map(({ biome, props }) => props.map((p, i) => <Prop key={`${biome.id}-s${i}`} biome={biome.id} p={p} colour={false} />))}
        </g>

        {/* Explored: colour revealed around the track you've travelled */}
        <g mask={`url(#reveal-${uid})`}>
          {bands.map(({ biome }, i) => {
            // Each region's revealed land takes its own colour
            const top = i === bands.length - 1 ? 0 : pointAt(biome.maxStation + 0.5).y;
            const bottom = i === 0 ? H : pointAt(biome.minStation - 0.5).y;
            const land = { desert: '#f0c27e', mountains: '#8fc47a', coast: '#a9dcef', city: '#b9b0cc' }[biome.id as string] ?? PAL.land;
            return <rect key={biome.id} x={0} y={top} width={W} height={bottom - top} fill={land} />;
          })}
          <rect width={W} height={H} fill={`url(#grain-${uid})`} opacity={0.18} />
          {bands.map(({ biome, props }) => props.map((p, i) => <Prop key={`${biome.id}-c${i}`} biome={biome.id} p={p} colour />))}
        </g>
        {travelled && (
          <polyline points={travelled} fill="none" stroke={PAL.landEdge} strokeWidth={76} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />
        )}

        {/* Region names */}
        {bands.filter(({ biome }) => biome.id !== 'terminus').map(({ biome, label }) => (
          <text
            key={biome.id}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor as 'start' | 'end'}
            className="route-map-label"
            fill="#5c4a2a"
          >
            {biome.name.toUpperCase()}
          </text>
        ))}

        {/* The whole line, as a dotted path still to travel */}
        <polyline points={FULL_ROUTE} fill="none" stroke="#7a6542" strokeWidth={2.2} strokeDasharray="4 4" strokeLinecap="round" />

        {/* Each answered leg in its train colour, with sleepers */}
        {legs.map((leg, i) => {
          const pts = polyline(leg.from, leg.to);
          if (!pts) return null;
          return (
            <g key={i}>
              <polyline points={pts} fill="none" stroke="#2e2e37" strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={pts} fill="none" stroke={TIER_COLORS[leg.tier]} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={pts} fill="none" stroke="#2e2e37" strokeWidth={4.5} strokeDasharray="1 5" opacity={0.45} />
            </g>
          );
        })}

        {/* Station dots */}
        {Array.from({ length: MAX_DAILY_STATIONS + 1 }, (_, s) => {
          const p = pointAt(s);
          const reached = s <= pos + 0.01;
          return <circle key={s} cx={p.x} cy={p.y} r={s % 8 === 0 ? 3 : 1.6} fill={reached ? '#2e2e37' : '#a8946a'} />;
        })}

        {/* Start and finish */}
        <g transform={`translate(${start.x} ${start.y + 12})`}>
          <text textAnchor="middle" className="route-map-label" fill="#4a3b22">WATERLOO WHARF</text>
        </g>
        <g transform={`translate(${end.x} ${end.y})`}>
          <line x1={0} y1={0} x2={0} y2={-16} stroke="#4a3b22" strokeWidth={1.5} />
          <path d="M0 -16 L10 -12.5 L0 -9 Z" fill="#d72638" />
        </g>
        <text x={end.x + (end.x > W / 2 ? -16 : 16)} y={end.y - 4} textAnchor={end.x > W / 2 ? 'end' : 'start'} className="route-map-label" fill="#4a3b22">
          TILBURY TERMINUS
        </text>

        {/* The train */}
        <g transform={`translate(${train.x} ${train.y}) rotate(${train.angle})`}>
          <circle r={11} fill={TIER_COLORS[trainTier]} opacity={0.25} className="route-map-pulse" />
          <rect x={-8} y={-4} width={12} height={8} rx={1} fill={TIER_COLORS[trainTier]} stroke="#1e1e24" strokeWidth={1.4} />
          <path d="M4 -4 L9 0 L4 4 Z" fill={TIER_COLORS[trainTier]} stroke="#1e1e24" strokeWidth={1.4} strokeLinejoin="round" />
          <rect x={-6} y={-2} width={3} height={2.5} fill="#1e1e24" />
          <rect x={-1.5} y={-2} width={3} height={2.5} fill="#1e1e24" />
        </g>
      </svg>

      <div className="route-map-stats">
        <span className="text-[#ffb000]">Q{questionNumber}/{totalQuestions}</span>
        <span>STN {Math.round(pos)}/{MAX_DAILY_STATIONS}</span>
        {expanded && <span>{left} TO GO</span>}
        <span className="text-[#ffb000]">{pct}%</span>
      </div>
    </div>
  );
};

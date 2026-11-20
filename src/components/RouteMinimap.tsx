import React from 'react';
import {
  getRouteBiomes,
  getRouteStations,
  getStationInfo,
} from '../games/next-stop/routes';
import {
  MAX_DAILY_SCORE,
  MAX_DAILY_STATIONS,
  POINTS_PER_STATION,
  type GameEdition,
} from '../games/next-stop/types';

interface RouteMinimapProps {
  edition: GameEdition;
  /** Stations completed before current ride (0..40, or uncapped in unlimited) */
  baseStations: number;
  /** Current live station index including during passive ride (0..40, or uncapped in unlimited) */
  currentStation: number;
  variant?: 'compact' | 'expanded';
  unlimited?: boolean;
}

const TOTAL_DOTS = MAX_DAILY_STATIONS + 1; // stations 0..40

export const RouteMinimap: React.FC<RouteMinimapProps> = ({
  edition,
  baseStations,
  currentStation,
  variant = 'compact',
  unlimited = false,
}) => {
  const curRaw = Math.max(baseStations, currentStation);
  const curInt = Math.round(curRaw);
  const curScore = curInt * POINTS_PER_STATION;
  const lap = unlimited ? Math.floor(curInt / TOTAL_DOTS) + 1 : 1;

  const clampedBase = unlimited
    ? Math.max(0, baseStations) % TOTAL_DOTS
    : Math.max(0, Math.min(MAX_DAILY_STATIONS, baseStations));
  const clampedCur = unlimited
    ? Math.max(0, curRaw) % TOTAL_DOTS
    : Math.max(clampedBase, Math.min(MAX_DAILY_STATIONS, curRaw));
  const displayDotIdx = unlimited ? curInt % TOTAL_DOTS : curInt;
  const basePct = (clampedBase / MAX_DAILY_STATIONS) * 100;
  const curPct = (clampedCur / MAX_DAILY_STATIONS) * 100;
  const legStartPct = curPct >= basePct ? basePct : 0;

  const stations = getRouteStations(edition);
  const biomes = getRouteBiomes(edition);
  const activeStationInfo = getStationInfo(edition, curInt, unlimited);
  const startName = stations[0]?.name ?? 'Start';
  const endName = stations[stations.length - 1]?.name ?? 'Terminus';

  if (variant === 'expanded') {
    return (
      <div className="n64-panel p-4 w-full" data-testid="route-minimap-expanded">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-pixel text-[#ffb000] mb-3">
          <span className="truncate">#00 {startName.toUpperCase()}</span>
          <span className="text-[#ffb000] tabular-nums">
            {unlimited
              ? `STN ${curInt} (LAP ${lap}) · ${curScore} PTS`
              : `STN ${curInt}/${MAX_DAILY_STATIONS} · ${curScore}/${MAX_DAILY_SCORE} PTS`}
          </span>
          <span className="truncate">#40 {endName.toUpperCase()}</span>
        </div>

        <div className="relative h-14 bg-[#16161b] border-2 border-[#3a3a44] px-3 flex items-center">
          <div className="relative w-full h-2.5 bg-[#2a2a32] border border-[#4a4a55]">
            {/* Biome colour segments */}
            {biomes.map((b) => {
              const left = (b.minStation / MAX_DAILY_STATIONS) * 100;
              const width =
                ((b.maxStation - b.minStation) / MAX_DAILY_STATIONS) * 100;
              return (
                <div
                  key={b.id}
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: b.groundHex }}
                  className="absolute top-0 bottom-0 opacity-40"
                  title={`${b.name} (Stn ${b.minStation}-${b.maxStation})`}
                />
              );
            })}

            {/* Journey fill */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-[#ffb000]"
              style={{ width: `${curPct}%` }}
            />

            {/* All 41 station dots */}
            {Array.from({ length: TOTAL_DOTS }, (_, idx) => {
              const left = (idx / MAX_DAILY_STATIONS) * 100;
              const isMajor = idx % 8 === 0;
              const reached = clampedCur >= idx - 0.01;
              return (
                <div
                  key={idx}
                  style={{ left: `${left}%` }}
                  title={`#${idx} ${stations[idx]?.name ?? ''}`}
                  className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 border border-[#0e0e12] ${
                    isMajor ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'
                  } ${reached ? 'bg-[#ffb000]' : 'bg-[#4a4a55]'}`}
                />
              );
            })}

            {/* Current station highlighted marker */}
            <div
              style={{ left: `${curPct}%` }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-[#ffb000] border-2 border-[#0e0e12] shadow"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 text-xs text-[#c9c1b2] tabular-nums">
          <span>
            NOW AT: <strong className="text-[#f2ebdd]">#{curInt} {activeStationInfo.name}</strong>
          </span>
          <span>0 · 8 · 16 · 24 · 32 · 40</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="n64-panel px-2.5 sm:px-3 py-1.5 sm:py-2 w-[172px] sm:w-80 select-none"
      data-testid="route-minimap"
      aria-label={`Route minimap: station ${curInt}${unlimited ? ` (lap ${lap})` : ` of ${MAX_DAILY_STATIONS}`}, ${curScore} points`}
    >
      <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-pixel tracking-tight mb-1.5 gap-1">
        <span className="text-[#ffb000] tabular-nums">
          {unlimited
            ? `STN ${String(curInt).padStart(2, '0')} · L${lap}`
            : `STN ${String(curInt).padStart(2, '0')}/${MAX_DAILY_STATIONS}`}
        </span>
        <span className="text-[#ffb000] tabular-nums">
          {curScore} PTS
        </span>
      </div>

      {/* 40-station pixel line map (41 station dots: 0..40) */}
      <div className="relative h-5 flex items-center px-1">
        <div className="relative w-full h-1.5 bg-[#16161b] border border-[#4a4a55]">
          {/* Completed journey line */}
          {legStartPct > 0 && (
            <div
              className="absolute top-0 bottom-0 left-0 bg-[#ffb000]"
              style={{ width: `${legStartPct}%` }}
            />
          )}

          {/* Active leg coloured line */}
          {curPct > legStartPct && (
            <div
              className="absolute top-0 bottom-0 bg-[#ffb000]"
              style={{ left: `${legStartPct}%`, width: `${curPct - legStartPct}%` }}
            />
          )}

          {/* Every station dot (0..40) */}
          {Array.from({ length: TOTAL_DOTS }, (_, idx) => {
            const left = (idx / MAX_DAILY_STATIONS) * 100;
            const isMajor = idx % 8 === 0;
            const reached = clampedCur >= idx - 0.05;
            const isCurrent = idx === displayDotIdx;
            return (
              <div
                key={idx}
                style={{ left: `${left}%` }}
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                  isCurrent
                    ? 'w-2 h-2.5 bg-[#ffb000] border border-[#0e0e12] z-10'
                    : isMajor
                      ? `w-1.5 h-2.5 border border-[#0e0e12] ${reached ? 'bg-[#ffb000]' : 'bg-[#6e695f]'}`
                      : `w-[2px] h-1.5 ${reached ? 'bg-[#ffb000]' : 'bg-[#4a4a55]'}`
                }`}
              />
            );
          })}

          {/* Animated player marker */}
          <div
            style={{ left: `${curPct}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-[#ffb000] border-2 border-[#0e0e12] z-20"
          />
        </div>
      </div>

      <div className="text-[11px] text-[#f2ebdd] truncate text-right mt-1 font-bold">
        #{String(curInt).padStart(2, '0')} {activeStationInfo.name}
      </div>
    </div>
  );
};

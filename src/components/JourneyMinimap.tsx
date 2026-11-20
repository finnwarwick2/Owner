import React from 'react';
import { MAX_DAILY_STATIONS, TIER_COLORS, type RarityTier } from '../games/next-stop/types';

interface JourneyMinimapProps {
  /** Tiers of the questions answered so far today, in order. */
  answeredTiers: RarityTier[];
  /** 1-based number of the question currently on screen. */
  questionNumber: number;
  totalQuestions: number;
  /** Live station position, including mid-ride. */
  currentStation: number;
  stationName: string;
  compact?: boolean;
}

export const JourneyMinimap: React.FC<JourneyMinimapProps> = ({
  answeredTiers,
  questionNumber,
  totalQuestions,
  currentStation,
  stationName,
  compact = false,
}) => {
  const station = Math.max(0, Math.min(MAX_DAILY_STATIONS, Math.round(currentStation)));
  const left = MAX_DAILY_STATIONS - station;
  const pct = Math.round((Math.min(MAX_DAILY_STATIONS, Math.max(0, currentStation)) / MAX_DAILY_STATIONS) * 100);

  const dots = (
    <div className="flex gap-1" aria-label={`Question ${questionNumber} of ${totalQuestions}`}>
      {Array.from({ length: totalQuestions }, (_, i) => {
        const tier = answeredTiers[i];
        const isCurrent = !tier && i === questionNumber - 1;
        return (
          <span
            key={i}
            className={`w-3.5 h-3.5 border-2 ${isCurrent ? 'border-[#ffb000]' : 'border-[#0e0e12]'}`}
            style={{ backgroundColor: tier ? TIER_COLORS[tier] : '#2e2e37' }}
          />
        );
      })}
    </div>
  );

  const bar = (
    <div className="relative h-2.5 bg-[#16161b] border border-[#4a4a55]">
      <div className="absolute inset-y-0 left-0 bg-[#ffb000]" style={{ width: `${pct}%` }} />
      {[0.2, 0.4, 0.6, 0.8].map((f) => (
        <span key={f} className="absolute inset-y-0 w-px bg-[#0e0e12]/60" style={{ left: `${f * 100}%` }} />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="n64-panel px-2.5 py-2 flex items-center gap-2.5 text-[10px] font-pixel text-[#f2ebdd] tabular-nums" data-testid="journey-minimap-compact">
        <span className="text-[#ffb000] whitespace-nowrap">Q{questionNumber}/{totalQuestions}</span>
        {dots}
        <div className="flex-1 min-w-0">{bar}</div>
        <span className="whitespace-nowrap">{station}/{MAX_DAILY_STATIONS} · {pct}%</span>
      </div>
    );
  }

  return (
    <div className="n64-panel p-3 w-64 space-y-2.5 text-[#f2ebdd]" data-testid="journey-minimap">
      <div className="flex items-center justify-between text-[10px] font-pixel">
        <span className="text-[#ffb000]">TODAY'S JOURNEY</span>
        <span className="tabular-nums">Q {questionNumber}/{totalQuestions}</span>
      </div>
      {dots}
      {bar}
      <div className="flex items-baseline justify-between text-[11px] font-pixel tabular-nums">
        <span>STN {station}/{MAX_DAILY_STATIONS}</span>
        <span className="text-[#c9c1b2]">{left} TO GO</span>
      </div>
      <p className="text-[11px] text-[#c9c1b2] leading-snug">
        <span className="text-[#ffb000] font-bold tabular-nums">{pct}%</span> of the max journey
      </p>
      <p className="text-[10px] font-pixel text-[#9a9386] truncate">NOW: {stationName.toUpperCase()}</p>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Award, Home, Infinity as InfinityIcon, Train } from 'lucide-react';
import { formatCountdown, msUntilLocalMidnight } from '../games/next-stop/daily';
import { getStationInfo } from '../games/next-stop/routes';
import {
  MAX_DAILY_SCORE,
  MAX_DAILY_STATIONS,
  TRAIN_SPECS,
  type DailyRunState,
  type GameEdition,
} from '../games/next-stop/types';
import {
  submitAndFetchDailyDistribution,
  type DailyDistributionResult,
} from '../services/scoreDistribution';
import { isDevMode, isEuropeUnlocked } from '../services/stripeCheckout';
import type { PlayerProfile } from '../types/arcade';
import { CrowdedTrainChart } from './CrowdedTrainChart';
import { RouteMinimap } from './RouteMinimap';

interface ResultsScreenProps {
  edition: GameEdition;
  run: DailyRunState;
  profile: PlayerProfile;
  onBackToHub: () => void;
  onOpenStats: () => void;
  onPlayUnlimited?: () => void;
  onOpenEurope?: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  edition,
  run,
  profile,
  onBackToHub,
  onOpenStats,
  onPlayUnlimited,
  onOpenEurope,
}) => {
  const europeOwned = isEuropeUnlocked();
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(msUntilLocalMidnight()),
  );
  const [distribution, setDistribution] = useState<DailyDistributionResult | null>(
    null,
  );
  const [loadingDist, setLoadingDist] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(msUntilLocalMidnight()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingDist(true);
    submitAndFetchDailyDistribution(edition, run.dateKey, run.totalScore)
      .then((res) => {
        if (active) {
          setDistribution(res);
          setLoadingDist(false);
        }
      })
      .catch(() => {
        if (active) setLoadingDist(false);
      });
    return () => {
      active = false;
    };
  }, [edition, run.dateKey, run.totalScore]);

  const titleText =
    edition === 'next-stop-europe' ? 'NEXT STOP EUROPE' : 'NEXT STOP';
  const finalStation = getStationInfo(edition, run.totalStations);

  return (
    <div
      className="fixed inset-0 z-20 overflow-y-auto bg-[#1e1e24]/95 p-4 sm:p-6"
      data-testid="results-screen"
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-4 pb-8">
        {/* Header Summary */}
        <div className="n64-panel-warm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[11px] font-pixel text-[#ffb000] mb-1">
              {titleText} · END OF LINE · {run.dateKey}
            </p>
            <h1 className="text-lg sm:text-2xl font-pixel text-[#f2ebdd] leading-snug">
              <span className="text-[#ffb000] tabular-nums whitespace-nowrap">
                {run.totalStations} / {MAX_DAILY_STATIONS} STATIONS
              </span>{' '}
              ·{' '}
              <span className="text-[#ffb000] tabular-nums whitespace-nowrap">
                {run.totalScore} / {MAX_DAILY_SCORE} PTS
              </span>
            </h1>
            <p className="text-xs text-[#c9c1b2] mt-1 tabular-nums">
              Terminated at #{String(finalStation.index).padStart(2, '0')} {finalStation.name} · 5 / 5 prompts completed
            </p>
          </div>

          <div className="bg-[#16161b] border-2 border-[#3a3a44] px-4 py-2.5 text-center shrink-0">
            <div className="text-[10px] text-[#9a9386]">NEXT PROMPTS IN</div>
            <div
              className="text-lg font-pixel text-[#ffb000] tabular-nums mt-0.5"
              data-testid="midnight-countdown"
            >
              {countdown}
            </div>
          </div>
        </div>

        {/* End-of-Day Crowded Train Bell Curve */}
        <CrowdedTrainChart
          distribution={distribution}
          playerScore={run.totalScore}
          profile={profile}
          loading={loadingDist}
        />

        {/* Europe upsell — one tasteful card, mainline only */}
        {edition === 'next-stop' && onOpenEurope && (
          <div
            className="n64-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-[6px] border-l-[#1f4ea8]"
            data-testid="europe-upsell"
          >
            <div>
              <p className="text-sm font-pixel text-[#f2ebdd]">Fancy a longer trip?</p>
              <p className="text-sm text-[#c9c1b2] mt-2 leading-relaxed">
                NEXT STOP EUROPE: 5 more prompts a day on a line from London to Stockholm.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenEurope}
              className="n64-btn bg-[#1f4ea8] text-[#f2ebdd] px-5 py-3 text-xs font-pixel cursor-pointer whitespace-nowrap shrink-0"
            >
              {europeOwned ? 'PLAY EUROPE' : 'GET IT · £1.99'}
            </button>
          </div>
        )}

        {/* Full 40-Station Route Minimap */}
        <RouteMinimap
          edition={edition}
          baseStations={run.totalStations}
          currentStation={run.totalStations}
          variant="expanded"
        />

        {/* 5 Prompt Breakdown */}
        <div className="flex flex-col gap-2.5">
          {run.attempts.map((att, idx) => {
            const spec = TRAIN_SPECS[att.tier];
            return (
              <div
                key={`${att.promptId}-${idx}`}
                className="n64-panel p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-[#c9c1b2]">
                    <span className="font-pixel text-[#ffb000]">#{idx + 1}</span>
                    <span>{att.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{att.promptText}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-bold text-[#f2ebdd]">
                      {att.answer ? `"${att.answer}"` : '(Timed Out)'}
                    </span>
                    <span className="text-xs text-[#c9c1b2]">{att.reason}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 border-[#3a3a44] pt-2 sm:pt-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-3 h-3 border border-[#0e0e12]"
                      style={{ backgroundColor: spec.accentHex }}
                    />
                    <span className="text-xs font-pixel text-[#f2ebdd] whitespace-nowrap">
                      {spec.trainName}
                    </span>
                  </div>
                  <div className="text-right tabular-nums whitespace-nowrap">
                    <span className="text-xs font-pixel text-[#ffb000]">
                      +{att.stations} STN
                    </span>
                    <span className="text-xs text-[#ffb000] ml-2 font-pixel">
                      (+{att.points} PTS)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBackToHub}
              className="n64-btn bg-[#3a3a44] text-[#f2ebdd] px-5 py-3 text-xs font-pixel flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Home className="w-4 h-4" />
              HOME
            </button>

            {edition === 'next-stop' && isDevMode() && onPlayUnlimited && (
              <button
                type="button"
                onClick={onPlayUnlimited}
                data-testid="results-dev-unlimited-btn"
                className="n64-btn bg-[#3a3a44] text-[#f2ebdd] px-5 py-3 text-xs font-pixel flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <InfinityIcon className="w-4 h-4" />
                DEV: UNLIMITED MODE
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenStats}
            className="n64-btn bg-[#a86f00] text-[#1e1e24] px-5 py-3 text-xs font-pixel flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Award className="w-4 h-4" />
            STATS
          </button>
        </div>

        <p className="text-xs text-[#9a9386] flex items-center gap-1.5">
          <Train className="w-3.5 h-3.5" />
          Daily runs reset at midnight local time. Your progress is saved on this device.
        </p>
      </div>
    </div>
  );
};

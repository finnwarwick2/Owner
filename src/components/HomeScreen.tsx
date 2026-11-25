import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, HelpCircle, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  formatCountdown,
  getLocalDateKey,
  isUnlimitedOpen,
  msUntilLocalMidnight,
  parseDateKeyToDayNumber,
} from '../games/next-stop/daily';
import { getRouteStations } from '../games/next-stop/routes';
import { computeCareerStats, loadProfile } from '../games/next-stop/storage';
import { NextStopSceneController } from '../three/NextStopScene';
import { TIER_COLORS, TIER_LABELS, TRAIN_SPECS, type GameEdition, type NextStopSaveData, type RarityTier } from '../games/next-stop/types';
import { isEuropeUnlocked } from '../services/stripeCheckout';

interface HomeScreenProps {
  saveData: NextStopSaveData;
  europeSaveData: NextStopSaveData;
  unlockVersion: number;
  muted: boolean;
  onToggleMute: () => void;
  onPlay: (edition: GameEdition) => void;
  onPlayUnlimited?: () => void;
  onOpenStats: () => void;
}

const LAUNCH_DAY = parseDateKeyToDayNumber('2026-11-01');

function runStatus(save: NextStopSaveData, dateKey: string) {
  const run = save.runsByDate[dateKey];
  if (!run || run.attempts.length === 0) return { state: 'fresh' as const, done: 0, score: 0 };
  if (run.completed) return { state: 'done' as const, done: 5, score: run.totalScore };
  return { state: 'partial' as const, done: run.attempts.length, score: run.totalScore };
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  saveData,
  europeSaveData,
  unlockVersion,
  muted,
  onToggleMute,
  onPlay,
  onPlayUnlimited,
  onOpenStats,
}) => {
  const dateKey = useMemo(() => getLocalDateKey(), []);
  const issueNo = Math.max(1, parseDateKeyToDayNumber(dateKey) - LAUNCH_DAY + 1);
  const dateLabel = useMemo(
    () =>
      new Date()
        .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        .toUpperCase(),
    [],
  );
  const main = runStatus(saveData, dateKey);
  const europe = runStatus(europeSaveData, dateKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const europeOwned = useMemo(() => isEuropeUnlocked(), [unlockVersion]);
  const stats = useMemo(
    () => computeCareerStats(saveData, dateKey),
    [saveData, dateKey],
  );
  const [showHelp, setShowHelp] = useState(false);
  const sceneMountRef = useRef<HTMLDivElement | null>(null);

  // Same hatched 3D countryside as the game, with trains rolling past.
  useEffect(() => {
    const el = sceneMountRef.current;
    if (!el) return;
    let controller: NextStopSceneController | null = null;
    try {
      controller = new NextStopSceneController(el, loadProfile(), 'next-stop', 0, {});
      controller.startShowcase();
    } catch {
      controller = null;
    }
    return () => controller?.dispose();
  }, []);
  const [countdown, setCountdown] = useState(() => formatCountdown(msUntilLocalMidnight()));

  useEffect(() => {
    document.body.dataset.state = 'home';
    if (main.state !== 'done') return;
    const id = window.setInterval(
      () => setCountdown(formatCountdown(msUntilLocalMidnight())),
      1000,
    );
    return () => window.clearInterval(id);
  }, [main.state]);

  const mainLabel =
    main.state === 'done'
      ? "SEE TODAY'S TRAIN"
      : main.state === 'partial'
        ? `CONTINUE  ${main.done}/5`
        : 'PLAY';

  const europeLabel = !europeOwned
    ? 'NEXT STOP EUROPE · £1.99'
    : europe.state === 'done'
      ? "EUROPE · SEE TODAY'S TRAIN"
      : europe.state === 'partial'
        ? `EUROPE · CONTINUE ${europe.done}/5`
        : 'PLAY NEXT STOP EUROPE';

  return (
    <div
      className="relative w-full h-full overflow-y-auto bg-[#e2d9c6] text-[#f2ebdd]"
      data-testid="home-screen"
    >
      <div ref={sceneMountRef} className="fixed inset-0 z-0" aria-hidden="true" />
      <div className="scanlines fixed inset-0 z-[1] opacity-35 pointer-events-none" />
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        className="absolute top-4 right-4 z-20 p-2 bg-[#1e1e24] border-2 border-[#0e0e12] text-[#c9c1b2] hover:text-[#ffb000] cursor-pointer"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      <div className="relative z-10 min-h-full flex flex-col items-center justify-start px-4 sm:px-6 pt-16 sm:pt-10 pb-44">
        <div className="relative z-10 w-full max-w-xl flex flex-col items-center text-center bg-[#1e1e24]/95 border-4 border-[#0e0e12] p-4 sm:p-5 shadow-[0_8px_0_rgba(14,14,18,0.6)]">
          <LedDepartureBoard issueNo={issueNo} dateLabel={dateLabel} done={main.state === 'done'} />

          <div className="mt-4 w-full flex items-center justify-between gap-4 text-xs font-pixel text-[#c9c1b2]">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-1.5 hover:text-[#ffb000] cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" /> HOW TO PLAY
            </button>
            <button
              type="button"
              onClick={onOpenStats}
              className="flex items-center gap-1.5 hover:text-[#ffb000] cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" /> STATS
            </button>
          </div>

          <button
            type="button"
            data-testid="play-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onPlay('next-stop');
            }}
            className="n64-btn mt-5 w-full bg-[#ffb000] text-[#1e1e24] py-5 text-lg sm:text-xl font-pixel cursor-pointer"
          >
            {mainLabel}
          </button>

          {onPlayUnlimited && isUnlimitedOpen() && (
            <button
              type="button"
              data-testid="home-unlimited-btn"
              onClick={() => {
                soundEngine.playUiClick();
                onPlayUnlimited();
              }}
              className="n64-btn mt-3 w-full bg-[#3a3a44] text-[#ffd27a] py-3 text-sm font-pixel cursor-pointer"
            >
              ∞ UNLIMITED PLAY
            </button>
          )}

          {main.state === 'done' && (
            <p className="mt-3 text-xs font-pixel text-[#9a9386] tabular-nums">
              {main.score} PTS TODAY · NEXT TRAINS IN{' '}
              <span className="text-[#ffb000]">{countdown}</span>
            </p>
          )}

          <div className="mt-6 space-y-2">
            <p className="font-pixel text-sm sm:text-xl text-[#ffb000] tracking-wide whitespace-nowrap">5 QUESTIONS. 1 TRAIN.</p>
            <p className="text-base sm:text-lg leading-relaxed text-[#f2ebdd] max-w-sm">
              Go obscure. The rarer your answer, the more stations you skip.
            </p>
          </div>

          <button
            type="button"
            data-testid="europe-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onPlay('next-stop-europe');
            }}
            className="mt-6 w-[86%] border-2 border-[#3a3a44] hover:border-[#ffb000] bg-[#16161b] py-3 px-4 text-[11px] sm:text-xs font-pixel text-[#f2ebdd] cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            <span className="inline-block w-2.5 h-2.5 bg-[#1f4ea8]" aria-hidden="true" />
            {europeLabel}
          </button>

          {stats.currentStreak > 0 && (
            <p className="mt-4 text-[11px] font-pixel text-[#6e695f]">
              {stats.currentStreak}-DAY STREAK
            </p>
          )}
        </div>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#0e0e12]/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="How to play"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="n64-panel max-w-md w-full p-6 text-left space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-pixel text-sm text-[#ffb000]">HOW TO PLAY</h2>
            <p className="text-sm leading-relaxed">
              You get 5 questions a day, the same for everyone. Type one answer to each
              within 20 seconds. Any correct answer counts, but rarer answers board
              faster trains that skip more stations.
            </p>
            <ul className="text-xs font-pixel space-y-2 text-[#c9c1b2]">
              <li>WRONG / NO ANSWER · 0 STN</li>
              {(['COMMON', 'FAKE_DEEP', 'UNCOMMON', 'RARE', 'LEGENDARY'] as RarityTier[]).map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border border-[#0e0e12]" style={{ backgroundColor: TIER_COLORS[t] }} />
                  <span style={{ color: TIER_COLORS[t] }}>{TIER_LABELS[t].toUpperCase()}</span>
                  <span>· {TRAIN_SPECS[t].trainName.toUpperCase()} · {TRAIN_SPECS[t].stations} STN</span>
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed">
              Each station is worth 10 points (400 max). At the end, see where you sit on
              today's crowded train.
            </p>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="n64-btn w-full bg-[#ffb000] text-[#1e1e24] py-3 text-xs font-pixel cursor-pointer"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function hhmm(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Amber dot-matrix departure board, like the ones hanging over UK platforms. */
const LedDepartureBoard: React.FC<{ issueNo: number; dateLabel: string; done: boolean }> = ({
  issueNo,
  done,
}) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const stations = useMemo(() => getRouteStations('next-stop').map((s) => s.name), []);
  const terminus = stations[stations.length - 1] ?? 'Terminus';
  const departs = new Date(Math.ceil((now.getTime() + 60_000) / 600_000) * 600_000);
  const callingAt = `Calling at: ${stations.slice(1, -1).join(', ')} and ${terminus}`;
  const clock = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="led-board led-board-flush w-full p-3 sm:p-4 text-left" data-testid="led-board" aria-label={`Next Stop departure board, number ${issueNo}`}>
      <div className="led-row led-text flex justify-between gap-3 px-2 text-lg sm:text-2xl">
        <span className="truncate">{hhmm(departs)} {terminus}</span>
        <span className="shrink-0">{done ? 'Arrived' : 'On time'}</span>
      </div>
      <div className="led-row led-text overflow-hidden px-2 mt-1 text-lg sm:text-2xl">
        <span className="led-marquee inline-block whitespace-nowrap">{callingAt}</span>
      </div>
      <div className="led-row led-text flex justify-center px-2 mt-1">
        <h1 className="text-4xl sm:text-6xl leading-none py-1 tracking-[0.12em] whitespace-nowrap text-center">NEXT STOP</h1>
      </div>
      <div className="led-text text-center text-4xl sm:text-6xl mt-3 tabular-nums tracking-[0.08em]">
        {clock}
      </div>
    </div>
  );
};

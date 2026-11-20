import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, HelpCircle, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  formatCountdown,
  getLocalDateKey,
  msUntilLocalMidnight,
  parseDateKeyToDayNumber,
} from '../games/next-stop/daily';
import { computeCareerStats } from '../games/next-stop/storage';
import type { GameEdition, NextStopSaveData } from '../games/next-stop/types';
import { isEuropeUnlocked } from '../services/stripeCheckout';

interface HomeScreenProps {
  saveData: NextStopSaveData;
  europeSaveData: NextStopSaveData;
  unlockVersion: number;
  muted: boolean;
  onToggleMute: () => void;
  onPlay: (edition: GameEdition) => void;
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
      <CountrysideBackdrop />
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
        className="absolute top-4 right-4 z-20 p-2 bg-[#1e1e24] border-2 border-[#0e0e12] text-[#c9c1b2] hover:text-[#ffb000] cursor-pointer"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      <div className="min-h-full flex flex-col items-center justify-center px-6 pt-14 pb-36">
        <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center bg-[#1e1e24]/95 border-4 border-[#0e0e12] p-5 shadow-[0_8px_0_rgba(14,14,18,0.6)]">
          {/* Departure-board logo */}
          <div className="w-full bg-[#0e0e12] border-4 border-[#2a2a32] px-5 pt-4 pb-5 shadow-[0_8px_0_#0e0e12]">
            <div className="flex justify-between text-[10px] font-pixel text-[#6e695f] mb-3">
              <span>NO. {issueNo}</span>
              <span>{dateLabel}</span>
            </div>
            <h1 className="font-dot dot-glow text-[3.4rem] sm:text-[4.2rem] leading-[0.95] tracking-[0.08em]">
              NEXT
              <br />
              STOP
            </h1>
            <div className="mt-4 h-1.5 w-full bg-[repeating-linear-gradient(90deg,#ffb000_0_6px,transparent_6px_12px)] opacity-70" />
          </div>

          <p className="mt-8 text-base sm:text-lg leading-relaxed text-[#f2ebdd] max-w-sm">
            Answer 5 daily prompts. The more{' '}
            <span className="text-[#ffb000]">obscure</span> your answer, the more stations
            your train skips.
          </p>

          <button
            type="button"
            data-testid="play-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onPlay('next-stop');
            }}
            className="n64-btn mt-8 w-full bg-[#ffb000] text-[#1e1e24] py-5 text-lg sm:text-xl font-pixel cursor-pointer"
          >
            {mainLabel}
          </button>

          {main.state === 'done' && (
            <p className="mt-3 text-xs font-pixel text-[#9a9386] tabular-nums">
              {main.score} PTS TODAY · NEXT PROMPTS IN{' '}
              <span className="text-[#ffb000]">{countdown}</span>
            </p>
          )}

          <button
            type="button"
            data-testid="europe-btn"
            onClick={() => {
              soundEngine.playUiClick();
              onPlay('next-stop-europe');
            }}
            className="mt-5 w-[86%] border-2 border-[#3a3a44] hover:border-[#ffb000] bg-[#16161b] py-3 px-4 text-[11px] sm:text-xs font-pixel text-[#f2ebdd] cursor-pointer flex items-center justify-center gap-2 transition-colors"
          >
            <span className="inline-block w-2.5 h-2.5 bg-[#1f4ea8]" aria-hidden="true" />
            {europeLabel}
          </button>

          <div className="mt-10 flex items-center gap-6 text-xs font-pixel text-[#9a9386]">
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
          {stats.currentStreak > 0 && (
            <p className="mt-4 text-[11px] font-pixel text-[#6e695f]">
              {stats.currentStreak}-DAY STREAK
            </p>
          )}
        </div>
      </div>

      {/* Big train crossing the bottom of the screen */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[5] h-32 overflow-hidden" aria-hidden="true">
        {/* Rails and sleepers */}
        <div className="absolute bottom-3 left-0 right-0 h-[6px] bg-[#44444f]" />
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-[repeating-linear-gradient(90deg,#2a2a32_0_14px,transparent_14px_34px)]" />
        <div className="home-train absolute bottom-[18px] flex items-end gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="relative w-36 h-20 bg-[#2e2e37] border-t-[6px] border-[#ffb000] shadow-[inset_0_-10px_0_#1e1e24]">
              <div className="flex gap-2 px-3 pt-3">
                {[0, 1, 2, 3].map((w) => (
                  <span key={w} className="w-6 h-7 bg-[#ffd27a] border-2 border-[#1e1e24]" />
                ))}
              </div>
              <div className="absolute left-0 right-0 bottom-4 h-2 bg-[#ffb000]" />
              <span className="absolute -bottom-3 left-4 w-7 h-7 rounded-full bg-[#16161b] border-4 border-[#8a8478]" />
              <span className="absolute -bottom-3 right-4 w-7 h-7 rounded-full bg-[#16161b] border-4 border-[#8a8478]" />
            </div>
          ))}
          {/* Locomotive */}
          <div className="relative w-44 h-24">
            <div className="absolute inset-0 bg-[#f2ebdd] [clip-path:polygon(0_0,62%_0,100%_100%,0_100%)]" />
            <div className="absolute left-3 top-3 w-16 h-9 bg-[#1e1e24] border-2 border-[#ffb000]" />
            <div className="absolute left-0 right-0 bottom-5 h-3 bg-[#ffb000] [clip-path:polygon(0_0,89%_0,93%_100%,0_100%)]" />
            <span className="absolute right-3 bottom-2 w-3 h-3 bg-[#ffd27a] shadow-[0_0_12px_4px_rgba(255,176,0,0.6)]" />
            <span className="absolute -bottom-3 left-5 w-7 h-7 rounded-full bg-[#16161b] border-4 border-[#8a8478]" />
            <span className="absolute -bottom-3 left-[5.5rem] w-7 h-7 rounded-full bg-[#16161b] border-4 border-[#8a8478]" />
          </div>
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
              You get 5 prompts a day, the same for everyone. Type one answer to each
              within 30 seconds. Any correct answer counts, but rarer answers board
              faster trains that skip more stations.
            </p>
            <ul className="text-xs font-pixel space-y-2 text-[#c9c1b2]">
              <li>WRONG / NO ANSWER · 0 STN</li>
              <li>COMMON · STOPPING SERVICE · 1 STN</li>
              <li>"CLEVER" CLICHÉ · LOCAL · 2 STN</li>
              <li>UNCOMMON · SEMI-FAST · 4 STN</li>
              <li className="text-[#ffb000]">RARE · EXPRESS · 6 STN</li>
              <li className="text-[#ffd27a]">LEGENDARY · NON-STOP BULLET · 8 STN</li>
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

/** Sunny countryside that scrolls past behind the home screen. */
const CountrysideBackdrop: React.FC = () => (
  <div className="home-countryside pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
    {/* Sun */}
    <div className="absolute right-[12%] top-[9%] w-24 h-24">
      <div className="home-sun-rays absolute -inset-6 rounded-full bg-[repeating-conic-gradient(#ffd27a_0deg_10deg,transparent_10deg_30deg)] opacity-80" />
      <div className="absolute inset-0 rounded-full bg-[#ffd27a]" />
      <div className="absolute inset-3 rounded-full bg-[#ffb000]" />
    </div>
    {/* Clouds */}
    <div className="home-layer home-clouds absolute left-0 top-[14%] h-24">
      <svg viewBox="0 0 1600 96" className="h-full w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
        <defs>
          <pattern id="cloud-tile" width="800" height="96" patternUnits="userSpaceOnUse">
            <g fill="#f2ebdd">
              <rect x="60" y="40" width="140" height="24" /><rect x="90" y="24" width="70" height="20" />
              <rect x="420" y="56" width="110" height="20" /><rect x="445" y="42" width="50" height="16" />
              <rect x="640" y="20" width="120" height="22" /><rect x="665" y="8" width="56" height="14" />
            </g>
          </pattern>
        </defs>
        <rect width="1600" height="96" fill="url(#cloud-tile)" />
      </svg>
    </div>
    {/* Far hills */}
    <div className="home-layer home-far absolute left-0 bottom-[150px] h-44">
      <svg viewBox="0 0 1600 176" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="far-tile" width="800" height="176" patternUnits="userSpaceOnUse">
            <path d="M0 120 Q100 30 200 96 T400 84 T600 60 T800 120 V176 H0Z" fill="#b9b2a3" />
          </pattern>
        </defs>
        <rect width="1600" height="176" fill="url(#far-tile)" />
      </svg>
    </div>
    {/* Near downs with trees */}
    <div className="home-layer home-near absolute left-0 bottom-[110px] h-40">
      <svg viewBox="0 0 1600 160" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="near-tile" width="800" height="160" patternUnits="userSpaceOnUse">
            <path d="M0 110 Q150 50 300 100 T600 92 T800 110 V160 H0Z" fill="#8a8478" />
            <g fill="#44444f">
              <path d="M140 84 l14 -34 l14 34z" /><rect x="151" y="84" width="6" height="10" />
              <path d="M180 80 l12 -28 l12 28z" /><rect x="189" y="80" width="6" height="10" />
              <path d="M520 92 l16 -38 l16 38z" /><rect x="533" y="92" width="6" height="10" />
            </g>
            <rect x="660" y="78" width="40" height="22" fill="#f2ebdd" />
            <path d="M654 80 l26 -18 l26 18z" fill="#d72638" />
          </pattern>
        </defs>
        <rect width="1600" height="160" fill="url(#near-tile)" />
      </svg>
    </div>
    {/* Patchwork fields with hedges and sheep */}
    <div className="home-layer home-fields absolute left-0 bottom-0 h-[130px]">
      <svg viewBox="0 0 1600 130" className="h-full w-full" preserveAspectRatio="none" shapeRendering="crispEdges">
        <defs>
          <pattern id="field-tile" width="800" height="130" patternUnits="userSpaceOnUse">
            <rect width="800" height="130" fill="#6e6e78" />
            <rect x="0" y="6" width="230" height="50" fill="#ffb000" />
            <rect x="0" y="16" width="230" height="6" fill="#a86f00" /><rect x="0" y="34" width="230" height="6" fill="#a86f00" />
            <rect x="240" y="6" width="200" height="50" fill="#c9c1b2" />
            <rect x="450" y="6" width="190" height="50" fill="#ffd27a" />
            <rect x="450" y="22" width="190" height="5" fill="#ffb000" /><rect x="450" y="40" width="190" height="5" fill="#ffb000" />
            <rect x="650" y="6" width="150" height="50" fill="#a8a49a" />
            <rect x="0" y="0" width="800" height="6" fill="#2e2e37" />
            <rect x="0" y="56" width="800" height="5" fill="#2e2e37" />
            <g fill="#f2ebdd"><rect x="280" y="24" width="14" height="9" /><rect x="320" y="34" width="14" height="9" /><rect x="372" y="20" width="14" height="9" /><rect x="690" y="28" width="14" height="9" /></g>
            <g fill="#1e1e24"><rect x="292" y="24" width="5" height="5" /><rect x="332" y="34" width="5" height="5" /><rect x="384" y="20" width="5" height="5" /><rect x="702" y="28" width="5" height="5" /></g>
          </pattern>
        </defs>
        <rect width="1600" height="130" fill="url(#field-tile)" />
      </svg>
    </div>
  </div>
);

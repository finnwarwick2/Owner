import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, HelpCircle, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  formatCountdown,
  getLocalDateKey,
  msUntilLocalMidnight,
  parseDateKeyToDayNumber,
} from '../games/next-stop/daily';
import { getRouteStations } from '../games/next-stop/routes';
import { computeCareerStats } from '../games/next-stop/storage';
import { TIER_COLORS, TIER_LABELS, TRAIN_SPECS, type GameEdition, type NextStopSaveData, type RarityTier } from '../games/next-stop/types';
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

          {main.state === 'done' && (
            <p className="mt-3 text-xs font-pixel text-[#9a9386] tabular-nums">
              {main.score} PTS TODAY · NEXT TRAINS IN{' '}
              <span className="text-[#ffb000]">{countdown}</span>
            </p>
          )}

          <div className="mt-6 space-y-2">
            <p className="font-pixel text-lg sm:text-xl text-[#ffb000] tracking-wide">5 QUESTIONS. 1 TRAIN.</p>
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
              You get 5 questions a day, the same for everyone. Type one answer to each
              within 30 seconds. Any correct answer counts, but rarer answers board
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

/** Two copies of an 800-wide tile side by side so a layer can loop seamlessly. */
const Tile: React.FC<{ id: string; h: number; children: React.ReactNode; className?: string }> = ({
  id,
  h,
  children,
  className = '',
}) => (
  <svg viewBox={`0 0 1600 ${h}`} className={`h-full w-full ${className}`} preserveAspectRatio="none">
    <g id={id}>{children}</g>
    <use href={`#${id}`} x="800" />
  </svg>
);

const roundTree = (x: number, y: number, r: number, leaf: string, dark: string) => (
  <g key={`rt${x}-${y}`}>
    <rect x={x - r * 0.12} y={y} width={r * 0.24} height={r * 0.9} fill="#6b4423" />
    <circle cx={x} cy={y - r * 0.2} r={r} fill={dark} />
    <circle cx={x - r * 0.25} cy={y - r * 0.45} r={r * 0.7} fill={leaf} />
  </g>
);
const pineTree = (x: number, y: number, h: number) => (
  <g key={`pt${x}-${y}`}>
    <rect x={x - 2} y={y} width={4} height={h * 0.25} fill="#5a3a1e" />
    <path d={`M${x} ${y - h} L${x + h * 0.32} ${y} L${x - h * 0.32} ${y} Z`} fill="#1f5e3a" />
    <path d={`M${x} ${y - h} L${x - h * 0.32} ${y} L${x - h * 0.05} ${y} Z`} fill="#2f7a4a" />
  </g>
);

/** Bright, colourful countryside that scrolls past behind the home screen. */
const CountrysideBackdrop: React.FC = () => (
  <div className="home-countryside pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
    <svg width="0" height="0" className="absolute">
      <defs>
        <linearGradient id="g-mtn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fa6c9" />
          <stop offset="1" stopColor="#5f7aa3" />
        </linearGradient>
        <linearGradient id="g-hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fcf6a" />
          <stop offset="1" stopColor="#5aa54a" />
        </linearGradient>
        <linearGradient id="g-hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6dbb4f" />
          <stop offset="1" stopColor="#3f8a3a" />
        </linearGradient>
        <linearGradient id="g-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d8f1ff" />
          <stop offset="1" stopColor="#7cc4f0" />
        </linearGradient>
      </defs>
    </svg>

    {/* Sun */}
    <div className="absolute right-[10%] top-[7%] w-28 h-28">
      <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,236,150,0.9),rgba(255,236,150,0)_70%)]" />
      <div className="home-sun-rays absolute -inset-5 rounded-full bg-[repeating-conic-gradient(rgba(255,226,120,0.75)_0deg_8deg,transparent_8deg_24deg)]" />
      <div className="absolute inset-0 rounded-full bg-[#ffe27a]" />
      <div className="absolute inset-3 rounded-full bg-[#ffd23f]" />
    </div>

    {/* Clouds */}
    <div className="home-layer home-clouds absolute left-0 top-[10%] h-36">
      <Tile id="clouds" h={144}>
        {[
          [90, 70, 1.1], [330, 105, 0.8], [520, 50, 1.25], [700, 95, 0.9],
        ].map(([x, y, k]) => (
          <g key={x} fill="#ffffff" opacity="0.95">
            <ellipse cx={x} cy={y} rx={70 * k} ry={20 * k} />
            <circle cx={x - 30 * k} cy={y - 12 * k} r={22 * k} />
            <circle cx={x + 6 * k} cy={y - 24 * k} r={30 * k} />
            <circle cx={x + 40 * k} cy={y - 10 * k} r={20 * k} />
            <ellipse cx={x} cy={y + 8 * k} rx={64 * k} ry={10 * k} fill="#dbeefa" />
          </g>
        ))}
      </Tile>
    </div>

    {/* Birds */}
    {[
      { top: '18%', dur: '26s', delay: '0s', scale: 1 },
      { top: '22%', dur: '26s', delay: '-1.2s', scale: 0.8 },
      { top: '15%', dur: '26s', delay: '-2s', scale: 0.7 },
      { top: '30%', dur: '34s', delay: '-14s', scale: 0.9 },
      { top: '27%', dur: '34s', delay: '-15.3s', scale: 0.65 },
    ].map((b, i) => (
      <div key={i} className="home-bird absolute left-0" style={{ top: b.top, animationDuration: b.dur, animationDelay: b.delay }}>
        <svg width={40 * b.scale} height={20 * b.scale} viewBox="0 0 40 20" className="home-bird-body" style={{ animationDelay: `${i * 0.13}s` }}>
          <path d="M2 8 Q10 0 20 10 Q30 0 38 8 Q30 4 20 14 Q10 4 2 8 Z" fill="#26323f" />
        </svg>
      </div>
    ))}

    {/* Snowy mountains with a waterfall */}
    <div className="home-layer home-mtn absolute left-0 bottom-[190px] h-[260px]">
      <Tile id="mtn" h={260}>
        <path d="M0 260 L0 200 L90 120 L150 160 L250 60 L330 140 L420 90 L520 30 L610 120 L700 80 L800 200 L800 260 Z" fill="url(#g-mtn)" />
        <path d="M250 60 L280 92 L262 88 L250 100 L238 86 L222 90 Z M520 30 L556 70 L536 64 L520 80 L506 66 L488 72 Z M700 80 L724 104 L706 100 L694 110 L680 102 Z M90 120 L108 136 L94 134 L84 140 L74 134 Z" fill="#ffffff" />
        <path d="M420 90 L470 60 L520 30 L520 260 L420 260 Z" fill="#000" opacity="0.08" />
        {/* waterfall */}
        <path d="M548 96 L566 96 L574 210 L540 210 Z" fill="#6a7f9e" />
        <rect x="550" y="98" width="14" height="112" fill="url(#g-water)" />
        <path className="home-waterfall" d="M553 98 V210 M557 98 V210 M561 98 V210" stroke="#ffffff" strokeWidth="2" strokeDasharray="10 8" />
        <ellipse cx="557" cy="214" rx="26" ry="7" fill="#ffffff" opacity="0.85" />
      </Tile>
    </div>

    {/* Far rolling hills */}
    <div className="home-layer home-far absolute left-0 bottom-[140px] h-[190px]">
      <Tile id="hfar" h={190}>
        <path d="M0 120 C80 70 160 70 240 105 C320 140 380 80 470 70 C560 60 620 120 700 110 C750 104 780 100 800 120 L800 190 L0 190 Z" fill="url(#g-hill-far)" />
        <path d="M0 150 C120 120 220 140 330 150 C450 160 560 130 680 140 C740 145 780 148 800 150 L800 190 L0 190 Z" fill="#000" opacity="0.06" />
        {[ [120, 100, 9], [150, 104, 7], [430, 86, 8], [455, 82, 10], [610, 112, 7] ].map(([x, y, r]) => roundTree(x, y, r, '#5cb85c', '#2f7d32'))}
      </Tile>
    </div>

    {/* Near hills with a river waterfall, mixed trees and a cottage */}
    <div className="home-layer home-near absolute left-0 bottom-[96px] h-[170px]">
      <Tile id="hnear" h={170}>
        <path d="M0 110 C100 60 200 70 300 100 C380 124 440 70 540 60 C640 50 720 100 800 110 L800 170 L0 170 Z" fill="url(#g-hill-near)" />
        {/* rocky outcrop with a falling stream */}
        <path d="M486 72 L540 60 L560 110 L520 128 L478 118 Z" fill="#8c8f94" />
        <path d="M486 72 L512 66 L506 120 L478 118 Z" fill="#a3a6ab" />
        <rect x="517" y="64" width="10" height="62" fill="url(#g-water)" />
        <path className="home-waterfall" d="M520 64 V126 M524 64 V126" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="7 6" />
        <ellipse cx="522" cy="130" rx="22" ry="6" fill="#dff4ff" />
        <path d="M500 132 C460 150 420 150 380 170 L420 170 C450 156 490 152 544 134 Z" fill="#7cc4f0" />
        {pineTree(60, 100, 46)}{pineTree(84, 96, 38)}{pineTree(600, 70, 44)}{pineTree(626, 72, 34)}
        {roundTree(170, 92, 16, '#6cc24a', '#3c8d2f')}
        {roundTree(204, 96, 12, '#f0a03a', '#d2702a')}
        {roundTree(236, 100, 14, '#e2563f', '#b33b2d')}
        {roundTree(700, 100, 15, '#6cc24a', '#3c8d2f')}
        {roundTree(735, 104, 11, '#f7c948', '#d99a2b')}
        {/* cottage */}
        <rect x="320" y="98" width="44" height="26" fill="#f6efe2" />
        <path d="M314 100 L342 80 L370 100 Z" fill="#c8403a" />
        <rect x="336" y="108" width="10" height="16" fill="#6b4423" />
        <rect x="350" y="104" width="8" height="8" fill="#7cc4f0" />
      </Tile>
    </div>

    {/* Patchwork fields with hedges, flowers and sheep */}
    <div className="home-layer home-fields absolute left-0 bottom-0 h-[130px]">
      <Tile id="fields" h={130} className="[shape-rendering:crispEdges]">
        <rect width="800" height="130" fill="#5ea84a" />
        <rect x="0" y="6" width="230" height="50" fill="#f5d33a" />
        <rect x="0" y="16" width="230" height="5" fill="#e3bb20" /><rect x="0" y="34" width="230" height="5" fill="#e3bb20" />
        <rect x="240" y="6" width="200" height="50" fill="#86cf63" />
        <rect x="450" y="6" width="190" height="50" fill="#e2b65a" />
        <rect x="450" y="22" width="190" height="4" fill="#c9963e" /><rect x="450" y="40" width="190" height="4" fill="#c9963e" />
        <rect x="650" y="6" width="150" height="50" fill="#8a5a3b" />
        <rect x="650" y="16" width="150" height="4" fill="#6f4529" /><rect x="650" y="32" width="150" height="4" fill="#6f4529" /><rect x="650" y="46" width="150" height="4" fill="#6f4529" />
        <rect x="0" y="0" width="800" height="6" fill="#2e6b2e" />
        <rect x="0" y="56" width="800" height="5" fill="#2e6b2e" />
        <g fill="#ffffff"><rect x="280" y="24" width="14" height="9" /><rect x="320" y="34" width="14" height="9" /><rect x="372" y="20" width="14" height="9" /><rect x="410" y="38" width="14" height="9" /></g>
        <g fill="#1e1e24"><rect x="292" y="24" width="5" height="5" /><rect x="332" y="34" width="5" height="5" /><rect x="384" y="20" width="5" height="5" /><rect x="422" y="38" width="5" height="5" /></g>
        <g fill="#e2563f"><rect x="60" y="66" width="3" height="3" /><rect x="140" y="72" width="3" height="3" /><rect x="520" y="68" width="3" height="3" /><rect x="610" y="74" width="3" height="3" /></g>
        <g fill="#ffffff"><rect x="100" y="70" width="3" height="3" /><rect x="300" y="66" width="3" height="3" /><rect x="560" y="72" width="3" height="3" /><rect x="740" y="68" width="3" height="3" /></g>
      </Tile>
    </div>
  </div>
);

function hhmm(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Amber dot-matrix departure board, like the ones hanging over UK platforms. */
const LedDepartureBoard: React.FC<{ issueNo: number; dateLabel: string; done: boolean }> = ({
  issueNo,
  dateLabel,
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
      <div className="led-row led-text flex items-baseline justify-between gap-3 px-2 mt-1">
        <h1 className="text-2xl sm:text-5xl tracking-[0.06em] whitespace-nowrap">NEXT STOP</h1>
        <span className="text-xs sm:text-base shrink-0">No.{issueNo} · {dateLabel}</span>
      </div>
      <div className="led-text text-center text-4xl sm:text-6xl mt-3 tabular-nums tracking-[0.08em]">
        {clock}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Home, Infinity as InfinityIcon, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  createUnlimitedPromptDeck,
  getLocalDateKey,
  isUnlimitedPlayDay,
  pickDailyPrompts,
  suggestCorrection,
} from '../games/next-stop/daily';
import { EUROPE_PROMPT_BANK } from '../games/next-stop/europePrompts';
import { judgeAnswer } from '../games/next-stop/judgeClient';
import { PROMPT_BANK } from '../games/next-stop/prompts';
import { getBiomeForStation, getStationInfo } from '../games/next-stop/routes';
import {
  loadNextStopSave,
  recordPromptAttempt,
  saveNextStopSave,
} from '../games/next-stop/storage';
import {
  MAX_DAILY_STATIONS,
  POINTS_PER_STATION,
  TRAIN_SPECS,
  type DailyRunState,
  type GameEdition,
  type JudgeResult,
  type NextStopSaveData,
  type PromptAttempt,
  type RarityTier,
  TIER_LABELS,
} from '../games/next-stop/types';
import { isDevMode, isEuropeUnlocked } from '../services/stripeCheckout';
import { NextStopSceneController } from '../three/NextStopScene';
import type { GamePlayProps } from '../types/arcade';
import { EuropePaywallScreen } from './EuropePaywallScreen';
import { ResultsScreen } from './ResultsScreen';
import { RouteMinimap } from './RouteMinimap';
import { JourneyMinimap } from './JourneyMinimap';

type GamePhase =
  | 'prompt'
  | 'suspense'
  | 'reveal'
  | 'arriving'
  | 'ride'
  | 'arrived'
  | 'results'
  | 'unlimited_summary';

const PROMPT_TIME_SECONDS = 30;
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?';

interface NextStopGameProps extends GamePlayProps {
  edition?: GameEdition;
  onUnlockStateChanged?: () => void;
  onSwitchEdition?: (edition: GameEdition) => void;
}

export const NextStopGame: React.FC<NextStopGameProps> = ({
  edition = 'next-stop',
  profile,
  muted,
  launchMode = 'daily',
  onToggleMute,
  onExitToHub,
  onOpenProfileStats,
  onProgressUpdated,
  onUnlockStateChanged,
  onSwitchEdition,
}) => {
  const [unlocked, setUnlocked] = useState(() =>
    edition === 'next-stop-europe' ? isEuropeUnlocked() : true,
  );
  const canUseUnlimited = edition === 'next-stop' && (isDevMode() || isUnlimitedPlayDay());
  const [playMode, setPlayMode] = useState<'daily' | 'unlimited'>(() =>
    canUseUnlimited && launchMode === 'unlimited' ? 'unlimited' : 'daily',
  );
  const isUnlimited = canUseUnlimited && playMode === 'unlimited';

  const dateKey = useMemo(() => getLocalDateKey(), []);
  const dailyPrompts = useMemo(() => {
    const bank = edition === 'next-stop-europe' ? EUROPE_PROMPT_BANK : PROMPT_BANK;
    const salt = edition === 'next-stop-europe' ? 37 : 0;
    return pickDailyPrompts(dateKey, bank, 5, salt);
  }, [dateKey, edition]);

  const [saveData, setSaveData] = useState<NextStopSaveData>(() =>
    loadNextStopSave(edition),
  );
  const currentRun: DailyRunState = useMemo(() => {
    return (
      saveData.runsByDate[dateKey] ?? {
        dateKey,
        promptIds: dailyPrompts.map((p) => p.id),
        attempts: [],
        completed: false,
        totalStations: 0,
        totalScore: 0,
      }
    );
  }, [saveData, dateKey, dailyPrompts]);

  // Isolated in-memory state for Dev Unlimited Mode
  const [unlimitedDeck, setUnlimitedDeck] = useState(() =>
    createUnlimitedPromptDeck(PROMPT_BANK, Date.now()),
  );
  const [unlimitedIdx, setUnlimitedIdx] = useState(0);
  const [unlimitedAttempts, setUnlimitedAttempts] = useState<PromptAttempt[]>([]);
  const [unlimitedStations, setUnlimitedStations] = useState(0);

  const [phase, setPhase] = useState<GamePhase>(() =>
    isUnlimited ? 'prompt' : currentRun.completed ? 'results' : 'prompt',
  );
  const [answerText, setAnswerText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(PROMPT_TIME_SECONDS);
  const [scrambleText, setScrambleText] = useState('CHECKING TIMETABLE...');
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [correction, setCorrection] = useState<{ typed: string; suggestion: string } | null>(null);
  const useCorrectionRef = useRef<HTMLButtonElement | null>(null);
  const [liveStationFloat, setLiveStationFloat] = useState(() =>
    isUnlimited ? 0 : currentRun.totalStations,
  );

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<NextStopSceneController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submittingRef = useRef(false);
  const currentAttemptRef = useRef<{
    promptObj: (typeof PROMPT_BANK)[number];
    answer: string;
    timedOut: boolean;
    judge: JudgeResult;
    startStation: number;
    unlimited: boolean;
  } | null>(null);

  const promptIdx = isUnlimited
    ? unlimitedIdx
    : Math.min(currentRun.attempts.length, dailyPrompts.length - 1);
  const activePrompt = isUnlimited
    ? unlimitedDeck[unlimitedIdx % Math.max(1, unlimitedDeck.length)]
    : dailyPrompts[promptIdx];
  const baseStations = isUnlimited ? unlimitedStations : currentRun.totalStations;
  const hasCanvas = unlocked && phase !== 'results' && phase !== 'unlimited_summary';

  useEffect(() => {
    if (!unlocked) {
      document.body.dataset.state = 'paywall';
    } else if (phase === 'results' || phase === 'unlimited_summary') {
      document.body.dataset.state = 'results';
    } else {
      document.body.dataset.state = isUnlimited ? 'unlimited' : 'playing';
    }
  }, [phase, unlocked, isUnlimited]);

  // Mount side-on Three.js scene whenever the canvas container is visible
  useEffect(() => {
    if (!hasCanvas) return;
    const el = mountRef.current;
    if (!el) return;

    const controller = new NextStopSceneController(
      el,
      profile,
      edition,
      baseStations,
      {},
    );
    sceneRef.current = controller;

    return () => {
      soundEngine.stopWind();
      controller.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCanvas, edition]);

  useEffect(() => {
    sceneRef.current?.updateProfile(profile);
  }, [profile]);

  useEffect(() => {
    sceneRef.current?.setCallbacks({
      onBoarded: () => {
        soundEngine.playDoorChime();
        setPhase('ride');
        const tier = currentAttemptRef.current?.judge.tier ?? 'COMMON';
        const windLevel =
          tier === 'LEGENDARY'
            ? 0.9
            : tier === 'RARE'
              ? 0.65
              : tier === 'UNCOMMON'
                ? 0.45
                : 0.25;
        soundEngine.setWindIntensity(windLevel);
      },
      onStationTick: (stationFloat, passedInt) => {
        setLiveStationFloat(stationFloat);
        const startSt = currentAttemptRef.current?.startStation ?? 0;
        if (passedInt > startSt) {
          soundEngine.playStationTick();
        }
      },
      onArrivalComplete: () => {
        soundEngine.stopWind();
        soundEngine.playDoorChime();
        const pending = currentAttemptRef.current;
        if (pending) {
          const promptObj = pending.promptObj;
          const spec = TRAIN_SPECS[pending.judge.tier];
          const attempt: PromptAttempt = {
            promptId: promptObj.id,
            promptText: promptObj.prompt,
            category: promptObj.category,
            answer: pending.answer,
            timedOut: pending.timedOut,
            valid: pending.judge.valid,
            tier: pending.judge.tier,
            stations: spec.stations,
            points: spec.stations * POINTS_PER_STATION,
            reason: pending.judge.reason,
            source: pending.judge.source,
          };

          if (pending.unlimited) {
            const nextStations = pending.startStation + spec.stations;
            setUnlimitedAttempts((prev) => [...prev, attempt]);
            setUnlimitedStations(nextStations);
            setLiveStationFloat(nextStations);
          } else {
            const nextSave = recordPromptAttempt(
              loadNextStopSave(edition),
              dateKey,
              dailyPrompts.map((p) => p.id),
              attempt,
            );
            saveNextStopSave(nextSave, edition);
            setSaveData(nextSave);
            setLiveStationFloat(
              Math.min(MAX_DAILY_STATIONS, pending.startStation + spec.stations),
            );
            onProgressUpdated();
          }
        }
        setPhase('arrived');
      },
    });
  }, [dateKey, dailyPrompts, edition, onProgressUpdated]);

  // Reset platform on entering prompt phase
  useEffect(() => {
    if (!hasCanvas || phase !== 'prompt') return;
    soundEngine.playStationChime();
    setSecondsLeft(PROMPT_TIME_SECONDS);
    setAnswerText('');
    setCorrection(null);
    setJudgeResult(null);
    setLiveStationFloat(baseStations);
    submittingRef.current = false;
    sceneRef.current?.resetToPlatform(baseStations, edition, isUnlimited);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [hasCanvas, phase, promptIdx, baseStations, edition, isUnlimited]);

  const handleSubmitAnswer = useCallback(
    async (timedOut: boolean, override?: string) => {
      if (submittingRef.current || phase !== 'prompt' || !activePrompt) return;
      submittingRef.current = true;
      setCorrection(null);

      const submitted = (override ?? answerText).trim();
      setPhase('suspense');

      const flipInterval = window.setInterval(() => {
        soundEngine.playBoardFlip();
        const text = Array.from({ length: 18 }, () =>
          SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
        ).join('');
        setScrambleText(text);
      }, 90);

      const minSuspense = new Promise((r) => window.setTimeout(r, 900));
      const [result] = await Promise.all([
        judgeAnswer(activePrompt, submitted, timedOut, edition),
        minSuspense,
      ]);

      window.clearInterval(flipInterval);

      currentAttemptRef.current = {
        promptObj: activePrompt,
        answer: submitted,
        timedOut,
        judge: result,
        startStation: baseStations,
        unlimited: isUnlimited,
      };
      setJudgeResult(result);
      setPhase('reveal');
      soundEngine.playTierFanfare(result.tier);
      soundEngine.playTrainHorn(result.tier);

      window.setTimeout(() => {
        setPhase('arriving');
        sceneRef.current?.triggerTrainSequence(
          result.tier,
          baseStations,
          edition,
          isUnlimited,
        );
      }, 850);
    },
    [phase, activePrompt, answerText, baseStations, edition, isUnlimited],
  );

  // 20-second countdown
  useEffect(() => {
    if (!hasCanvas || phase !== 'prompt') return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          void handleSubmitAnswer(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasCanvas, phase, handleSubmitAnswer]);

  const startUnlimitedRun = useCallback(() => {
    if (!canUseUnlimited) return;
    soundEngine.playUiClick();
    soundEngine.stopWind();
    setUnlimitedDeck(createUnlimitedPromptDeck(PROMPT_BANK, Date.now()));
    setUnlimitedIdx(0);
    setUnlimitedAttempts([]);
    setUnlimitedStations(0);
    setLiveStationFloat(0);
    setJudgeResult(null);
    setPlayMode('unlimited');
    setPhase('prompt');
  }, [canUseUnlimited]);

  const handleEndUnlimitedRun = useCallback(() => {
    soundEngine.playUiClick();
    soundEngine.stopWind();
    setPhase('unlimited_summary');
  }, []);

  const handleAdvanceAfterArrival = useCallback(() => {
    soundEngine.playUiClick();
    if (isUnlimited) {
      setUnlimitedIdx((prev) => {
        const next = prev + 1;
        if (next >= unlimitedDeck.length) {
          setUnlimitedDeck(createUnlimitedPromptDeck(PROMPT_BANK, Date.now() + next));
          return 0;
        }
        return next;
      });
      setPhase('prompt');
      return;
    }

    const latestSave = loadNextStopSave(edition);
    const latestRun = latestSave.runsByDate[dateKey];
    if (latestRun?.completed) {
      setSaveData(latestSave);
      setPhase('results');
    } else {
      setPhase('prompt');
    }
  }, [dateKey, edition, isUnlimited, unlimitedDeck.length]);

  // Move straight on to the next question (or the results) after arriving.
  useEffect(() => {
    if (phase !== 'arrived') return;
    const id = window.setTimeout(() => handleAdvanceAfterArrival(), 1700);
    return () => window.clearTimeout(id);
  }, [phase, handleAdvanceAfterArrival]);

  useEffect(() => {
    if (correction) useCorrectionRef.current?.focus();
  }, [correction]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (e.key.toLowerCase() === 'm' && !isTyping) {
        onToggleMute();
      } else if (phase === 'arrived' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleAdvanceAfterArrival();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, handleAdvanceAfterArrival, onToggleMute]);

  if (!unlocked && edition === 'next-stop-europe') {
    return (
      <EuropePaywallScreen
        onUnlocked={() => {
          setUnlocked(true);
          onUnlockStateChanged?.();
        }}
        onBackToHub={onExitToHub}
      />
    );
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        key="results-view"
        edition={edition}
        run={currentRun}
        profile={profile}
        onBackToHub={onExitToHub}
        onOpenStats={() => onOpenProfileStats('stats')}
        onPlayUnlimited={canUseUnlimited ? startUnlimitedRun : undefined}
        onOpenEurope={
          onSwitchEdition ? () => onSwitchEdition('next-stop-europe') : undefined
        }
      />
    );
  }

  if (phase === 'unlimited_summary') {
    const unlimitedStationInfo = getStationInfo(edition, unlimitedStations, true);
    const unlimitedScore = unlimitedStations * POINTS_PER_STATION;
    return (
      <div
        key="unlimited-summary-view"
        className="fixed inset-0 z-20 overflow-y-auto bg-[#1e1e24]/95 p-4 sm:p-6"
        data-testid="unlimited-summary-screen"
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-4 pb-8">
          <div className="n64-panel-warm p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-[11px] font-pixel text-[#ffb000] mb-1 flex items-center gap-1.5">
                <InfinityIcon className="w-3.5 h-3.5" />
                NEXT STOP · UNLIMITED (TODAY ONLY)
              </p>
              <h1 className="text-lg sm:text-2xl font-pixel text-[#f2ebdd] leading-snug">
                <span className="text-[#ffb000] tabular-nums">
                  {unlimitedStations} STATIONS
                </span>{' '}
                ·{' '}
                <span className="text-[#ffb000] tabular-nums">
                  {unlimitedScore} PTS
                </span>
              </h1>
              <p className="text-xs text-[#c9c1b2] mt-1 tabular-nums">
                Reached #{String(unlimitedStationInfo.index).padStart(2, '0')}{' '}
                {unlimitedStationInfo.name} · {unlimitedAttempts.length} questions played
              </p>
            </div>

            <div className="bg-[#16161b] border-2 border-[#3a3a44] px-4 py-2.5 text-center shrink-0">
              <div className="text-[10px] text-[#ffb000] font-pixel">BONUS PLAY</div>
              <div className="text-[11px] text-[#9a9386] mt-1">
                Daily score untouched
              </div>
            </div>
          </div>

          <RouteMinimap
            edition={edition}
            baseStations={unlimitedStations}
            currentStation={unlimitedStations}
            variant="expanded"
            unlimited
          />

          {unlimitedAttempts.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {unlimitedAttempts.map((att, idx) => {
                const spec = TRAIN_SPECS[att.tier];
                return (
                  <div
                    key={`${att.promptId}-${idx}`}
                    className="n64-panel p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[10px] text-[#9a9386]">
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
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onExitToHub}
              className="n64-btn bg-[#3a3a44] text-[#f2ebdd] px-5 py-3 text-xs font-pixel flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Home className="w-4 h-4" />
              HOME
            </button>

            <button
              type="button"
              onClick={startUnlimitedRun}
              data-testid="new-unlimited-run-btn"
              className="n64-btn bg-[#3a3a44] text-[#f2ebdd] px-5 py-3 text-xs font-pixel flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              NEW UNLIMITED RUN
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeTier: RarityTier = judgeResult?.tier ?? 'COMMON';
  const activeSpec = TRAIN_SPECS[activeTier];
  const minimapBase =
    phase === 'arrived'
      ? Math.max(0, baseStations - activeSpec.stations)
      : baseStations;
  const minimapCurrent = phase === 'arrived' ? baseStations : liveStationFloat;
  const currentStationInfo = getStationInfo(edition, minimapCurrent, isUnlimited);
  const currentBiome = getBiomeForStation(edition, minimapCurrent, isUnlimited);
  const answeredCount = currentRun.attempts.length;
  const questionNumber = Math.min(
    dailyPrompts.length,
    Math.max(1, answeredCount + (phase === 'arrived' ? 0 : 1)),
  );
  const answeredTiers = currentRun.attempts.map((a) => a.tier);
  const editionBadge = isUnlimited
    ? 'UNLIMITED'
    : edition === 'next-stop-europe'
      ? 'NEXT STOP EUROPE'
      : 'NEXT STOP';

  return (
    <div
      key="gameplay-view"
      className="relative w-full h-full overflow-hidden bg-[#1e1e24] select-none"
    >
      {/* Side-On Low-Res N64 3D Canvas */}
      <div
        ref={mountRef}
        data-testid="next-stop-canvas-mount"
        className="absolute inset-0 w-full h-full"
      />

      <div className="scanlines fixed inset-0 z-[2] opacity-35" />

      {/* Always-Visible HUD Overlay */}
      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
        {/* Top Row: Left controls + Top-Right Always-Visible 40-Station Minimap */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                onExitToHub();
              }}
              aria-label="Return home"
              className="n64-btn bg-[#2a2a32] text-[#f2ebdd] px-3 py-2 text-[10px] font-pixel flex items-center gap-1.5 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
            </button>

            {isUnlimited && (
              <button
                type="button"
                onClick={handleEndUnlimitedRun}
                data-testid="end-unlimited-btn"
                className="n64-btn bg-[var(--accent-dark)] text-[#ffd27a] px-3 py-2 text-[10px] font-pixel flex items-center gap-1.5 cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5" />
                END RUN
              </button>
            )}

            <div
              className="n64-panel px-3 py-2 text-[11px] font-pixel text-[#f2ebdd] tabular-nums"
              data-testid="hud-progress-pill"
            >
              <span className={`${isUnlimited ? 'text-[#ffb000]' : 'text-[#ffb000]'} mr-2`}>
                {editionBadge}
              </span>
              {isUnlimited
                ? `#${unlimitedAttempts.length + (phase === 'arrived' ? 0 : 1)} · ${baseStations} STN (${baseStations * POINTS_PER_STATION} PTS)`
                : `Q${questionNumber}/${dailyPrompts.length} · ${baseStations} STN (${baseStations * POINTS_PER_STATION} PTS)`}
            </div>

            {phase === 'prompt' && (
              <div
                data-testid="station-clock"
                className={`n64-panel px-3 py-2 text-xs sm:text-sm font-pixel tabular-nums ${
                  secondsLeft <= 4
                    ? 'text-[var(--accent)] border-[var(--accent)]'
                    : secondsLeft <= 8
                      ? 'text-[#ffb000] border-[#ffb000]'
                      : 'text-[#ffb000]'
                }`}
              >
                {String(secondsLeft).padStart(2, '0')}S
              </div>
            )}

            {(phase === 'ride' || phase === 'arriving') && (
              <div className="n64-panel px-3 py-2 text-[11px] font-pixel text-[#f2ebdd] flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 border border-[#0e0e12]"
                  style={{ backgroundColor: activeSpec.accentHex }}
                />
                <span>{activeSpec.trainName}</span>
                <span className="text-[#ffb000]">+{activeSpec.stations} STN</span>
                <span className="text-[#c9c1b2] hidden sm:inline">· {currentBiome.name}</span>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 pointer-events-auto">

            <button
              type="button"
              onClick={onToggleMute}
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="n64-btn bg-[#2a2a32] text-[#f2ebdd] p-2 cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Hanging Retro Flip-Style Departure Board (Prompt / Suspense / Reveal) */}
        {(phase === 'prompt' || phase === 'suspense' || phase === 'reveal') && (
          <div className="w-full max-w-2xl mx-auto mt-1 mb-auto">
            <div
              className="led-board px-4 py-3 text-center"
              data-testid="departure-board"
            >
              <div className="led-row led-text text-sm sm:text-base tracking-wide mb-1.5 px-2">
                {phase === 'suspense'
                  ? 'FLIPPING DEPARTURE BOARD...'
                  : `#${String(currentStationInfo.index).padStart(2, '0')} ${currentStationInfo.name.toUpperCase()} · ${activePrompt?.category ?? 'DAILY'}`}
              </div>
              <div className="led-row led-text text-xl sm:text-3xl leading-snug px-2 py-1">
                {phase === 'suspense' ? scrambleText : activePrompt?.prompt}
              </div>
            </div>
          </div>
        )}

        {!isUnlimited && (
          <div className="hidden xl:block absolute right-5 bottom-5 pointer-events-none">
            <JourneyMinimap
              answeredTiers={answeredTiers}
              questionNumber={questionNumber}
              totalQuestions={dailyPrompts.length}
              currentStation={minimapCurrent}
              stationName={currentStationInfo.name}
            />
          </div>
        )}

        {/* Bottom Zone: Input OR Tier Reveal OR Arrival Card */}
        <div className="w-full max-w-xl mx-auto pointer-events-auto">
          {!isUnlimited && (
            <div className="xl:hidden mb-2 pointer-events-none">
              <JourneyMinimap
                compact
                answeredTiers={answeredTiers}
                questionNumber={questionNumber}
                totalQuestions={dailyPrompts.length}
                currentStation={minimapCurrent}
                stationName={currentStationInfo.name}
              />
            </div>
          )}
          {phase === 'prompt' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (correction) return;
                const suggestion = activePrompt ? suggestCorrection(activePrompt, answerText) : null;
                if (suggestion) {
                  soundEngine.playUiClick();
                  setCorrection({ typed: answerText.trim(), suggestion });
                  return;
                }
                void handleSubmitAnswer(false);
              }}
              className="relative n64-panel p-2.5 flex flex-col sm:flex-row gap-2"
            >
              {correction && (
                <div
                  className="absolute inset-x-0 bottom-0 z-10 bg-[#16161b] border-4 border-[#ffb000] p-3 shadow-[0_6px_0_#0e0e12]"
                  role="dialog"
                  aria-label="Spelling check"
                  data-testid="spelling-check"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setCorrection(null);
                      inputRef.current?.focus();
                    }
                  }}
                >
                  <div className="text-[10px] font-pixel text-[#c9c1b2] mb-1.5">DID YOU MEAN?</div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                    <span className="font-sans font-semibold text-base text-[#9a9386] line-through decoration-[#e5484d] decoration-[3px]">
                      {correction.typed}
                    </span>
                    <span className="font-sans font-bold text-xl text-[#ffb000]">{correction.suggestion}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      ref={useCorrectionRef}
                      data-testid="use-correction-btn"
                      onClick={() => {
                        setAnswerText(correction.suggestion);
                        void handleSubmitAnswer(false, correction.suggestion);
                      }}
                      className="n64-btn flex-1 bg-[#ffb000] text-[#1e1e24] px-4 py-2.5 text-xs font-pixel cursor-pointer min-h-[44px]"
                    >
                      USE "{correction.suggestion.toUpperCase()}"
                    </button>
                    <button
                      type="button"
                      data-testid="keep-answer-btn"
                      onClick={() => void handleSubmitAnswer(false, correction.typed)}
                      className="n64-btn bg-[#3a3a44] text-[#f2ebdd] px-4 py-2.5 text-xs font-pixel cursor-pointer min-h-[44px]"
                    >
                      KEEP MINE
                    </button>
                  </div>
                </div>
              )}
              <label htmlFor="next-stop-answer" className="sr-only">
                Your answer
              </label>
              <input
                id="next-stop-answer"
                ref={inputRef}
                type="text"
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type your most obscure valid answer..."
                maxLength={80}
                autoComplete="off"
                className="flex-1 bg-[#16161b] border-2 border-[#4a4a55] px-3.5 py-2.5 font-sans font-semibold text-sm sm:text-base text-[#f2ebdd] placeholder:text-[#9a9386] focus:outline-none focus:border-[#ffb000]"
              />
              <button
                type="submit"
                className="n64-btn bg-[#ffb000] text-[#1e1e24] px-4 py-2.5 text-xs font-pixel cursor-pointer whitespace-nowrap min-h-[44px]"
              >
                BOARD TRAIN
              </button>
            </form>
          )}

          {(phase === 'reveal' || phase === 'arriving' || phase === 'ride') && judgeResult && (
            <div
              className="n64-panel-warm p-4 text-center space-y-1.5"
              data-testid="tier-reveal-banner"
            >
              <div className="flex items-center justify-center gap-2.5 flex-wrap">
                <span
                  className="px-2.5 py-1 text-[11px] font-pixel text-[#1e1e24]"
                  style={{ backgroundColor: activeSpec.accentHex }}
                >
                  {TIER_LABELS[judgeResult.tier].toUpperCase()}
                </span>
                <span className="text-sm sm:text-base font-pixel text-[#f2ebdd]">
                  {activeSpec.trainName}
                </span>
                <span className="text-xs sm:text-sm font-pixel text-[#ffb000] tabular-nums">
                  +{activeSpec.stations} STN ({activeSpec.points} PTS)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#f2ebdd]">{judgeResult.reason}</p>
            </div>
          )}

          {phase === 'arrived' && (
            <div
              className="n64-panel-warm p-4 text-center space-y-3"
              data-testid="arrival-station-sign"
            >
              <div className="text-xs font-pixel text-[#ffb000]">
                {activeSpec.stations > 0
                  ? `ARRIVED AT #${String(currentStationInfo.index).padStart(2, '0')} ${currentStationInfo.name.toUpperCase()}`
                  : `STAYED AT #${String(currentStationInfo.index).padStart(2, '0')} ${currentStationInfo.name.toUpperCase()}`}
              </div>
              <div className="text-base sm:text-lg font-pixel text-[#f2ebdd] tabular-nums">
                +{activeSpec.stations} STATIONS · +{activeSpec.points} PTS
              </div>
              {judgeResult && (
                <p className="text-xs sm:text-sm text-[#f2ebdd]">{judgeResult.reason}</p>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleAdvanceAfterArrival}
                  data-testid="next-prompt-btn"
                  className="n64-btn bg-[#ffb000] text-[#1e1e24] px-5 py-2.5 text-xs font-pixel cursor-pointer min-h-[44px]"
                >
                  {isUnlimited
                    ? 'NEXT TRAIN'
                    : answeredCount >= dailyPrompts.length
                      ? 'VIEW CROWDED TRAIN RESULTS'
                      : `NEXT TRAIN · Q${answeredCount + 1}/${dailyPrompts.length}`}
                </button>
                {isUnlimited && (
                  <button
                    type="button"
                    onClick={handleEndUnlimitedRun}
                    className="n64-btn bg-[#2a2a32] text-[#f2ebdd] px-4 py-2.5 text-xs font-pixel cursor-pointer min-h-[44px]"
                  >
                    END RUN
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

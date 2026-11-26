import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Home, Infinity as InfinityIcon, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  createUnlimitedPromptDeck,
  getLocalDateKey,
  isUnlimitedOpen,
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
  TIER_COLORS,
  TIER_LABELS,
} from '../games/next-stop/types';
import { isDevMode, isEuropeUnlocked } from '../services/stripeCheckout';
import { NextStopSceneController } from '../three/NextStopScene';
import type { GamePlayProps } from '../types/arcade';
import { EuropePaywallScreen } from './EuropePaywallScreen';
import { ResultsScreen } from './ResultsScreen';
import { RouteMinimap } from './RouteMinimap';
import { RouteMap, type RouteLeg } from './RouteMap';
import { FlapText } from './FlapText';

type GamePhase =
  | 'prompt'
  | 'suspense'
  | 'reveal'
  | 'arriving'
  | 'ride'
  | 'arrived'
  | 'results'
  | 'unlimited_summary';

const PROMPT_TIME_SECONDS = 20;
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
  const canUseUnlimited = edition === 'next-stop' && (isDevMode() || isUnlimitedOpen());
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

  // Unlimited = practice rounds of 5, played exactly like the daily game but
  // kept in memory only (never saved, never sent to the crowd chart).
  const [practiceSeed] = useState(() => Date.now());
  const [practiceRound, setPracticeRound] = useState(0);
  const [practiceAttempts, setPracticeAttempts] = useState<PromptAttempt[]>([]);
  const practicePrompts = useMemo(() => {
    const dailyIds = new Set(dailyPrompts.map((p) => p.id));
    const pool = PROMPT_BANK.filter((p) => !dailyIds.has(p.id)); // no spoilers for today
    const perDeck = Math.floor(pool.length / 5);
    const cycle = Math.floor(practiceRound / perDeck);
    const deck = createUnlimitedPromptDeck(pool, practiceSeed + cycle * 7919);
    const start = (practiceRound % perDeck) * 5;
    return deck.slice(start, start + 5);
  }, [dailyPrompts, practiceRound, practiceSeed]);
  const practiceRun: DailyRunState = useMemo(() => {
    const totalStations = Math.min(
      MAX_DAILY_STATIONS,
      practiceAttempts.reduce((sum, a) => sum + a.stations, 0),
    );
    return {
      dateKey,
      promptIds: practicePrompts.map((p) => p.id),
      attempts: practiceAttempts,
      completed: practiceAttempts.length >= practicePrompts.length,
      totalStations,
      totalScore: totalStations * POINTS_PER_STATION,
    };
  }, [dateKey, practicePrompts, practiceAttempts]);

  const [phase, setPhase] = useState<GamePhase>(() =>
    isUnlimited ? 'prompt' : currentRun.completed ? 'results' : 'prompt',
  );
  const [answerText, setAnswerText] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(PROMPT_TIME_SECONDS);
  const [scrambleText, setScrambleText] = useState('CHECKING TIMETABLE...');
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  const [correction, setCorrection] = useState<{ typed: string; suggestion: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [wrongGuess, setWrongGuess] = useState<{ text: string; count: number } | null>(null);
  const timeUpRef = useRef(false);
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

  const run = isUnlimited ? practiceRun : currentRun;
  const roundPrompts = isUnlimited ? practicePrompts : dailyPrompts;
  const promptIdx = Math.min(run.attempts.length, roundPrompts.length - 1);
  const activePrompt = roundPrompts[promptIdx];
  const baseStations = run.totalStations;
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
            setPracticeAttempts((prev) => [...prev, attempt]);
            setLiveStationFloat(Math.min(MAX_DAILY_STATIONS, pending.startStation + spec.stations));
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
    setChecking(false);
    setWrongGuess(null);
    timeUpRef.current = false;
    setJudgeResult(null);
    setLiveStationFloat(baseStations);
    submittingRef.current = false;
    sceneRef.current?.resetToPlatform(baseStations, edition, false);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [hasCanvas, phase, promptIdx, baseStations, edition, isUnlimited]);

  /** Flip the board, reveal the level and send the train (or no train). */
  const runTrainSequence = useCallback(
    async (submitted: string, timedOut: boolean, resultPromise: Promise<JudgeResult>) => {
      if (!activePrompt) return;
      setPhase('suspense');
      const flipInterval = window.setInterval(() => {
        soundEngine.playBoardFlip();
        const text = Array.from({ length: 18 }, () =>
          SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
        ).join('');
        setScrambleText(text);
      }, 90);
      const minSuspense = new Promise((r) => window.setTimeout(r, 900));
      const [result] = await Promise.all([resultPromise, minSuspense]);
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
        sceneRef.current?.triggerTrainSequence(result.tier, baseStations, edition, false);
      }, 1700);
    },
    [activePrompt, baseStations, edition, isUnlimited],
  );

  const handleSubmitAnswer = useCallback(
    async (timedOut: boolean, override?: string, exactOnly = false) => {
      if (phase !== 'prompt' || !activePrompt) return;
      if (submittingRef.current) {
        // Time ran out while an answer was being checked: finish once the check returns.
        if (timedOut) timeUpRef.current = true;
        return;
      }
      submittingRef.current = true;
      setCorrection(null);
      const submitted = (override ?? answerText).trim();

      if (timedOut) {
        // Out of time: whatever is typed is the final answer.
        await runTrainSequence(submitted, true, judgeAnswer(activePrompt, submitted, true, edition, { exactOnly }));
        return;
      }
      if (!submitted) {
        submittingRef.current = false;
        inputRef.current?.focus();
        return;
      }

      // Check the answer while the clock keeps running.
      setChecking(true);
      const result = await judgeAnswer(activePrompt, submitted, false, edition, { exactOnly });
      setChecking(false);

      if (!result.valid) {
        if (timeUpRef.current) {
          await runTrainSequence(submitted, true, Promise.resolve({ ...result, source: 'timeout' as const, reason: 'Time ran out before a valid answer arrived.' }));
          return;
        }
        // Wrong: have another go. The timer does not reset.
        soundEngine.playWrongBuzz();
        setWrongGuess((prev) => ({ text: submitted, count: (prev?.count ?? 0) + 1 }));
        setAnswerText('');
        submittingRef.current = false;
        window.setTimeout(() => inputRef.current?.focus(), 30);
        return;
      }

      await runTrainSequence(submitted, false, Promise.resolve(result));
    },
    [phase, activePrompt, answerText, edition, runTrainSequence],
  );
  const submitRef = useRef(handleSubmitAnswer);
  submitRef.current = handleSubmitAnswer;

  // 20-second countdown
  useEffect(() => {
    if (!hasCanvas || phase !== 'prompt') return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          void submitRef.current(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasCanvas, phase]);

  const startUnlimitedRun = useCallback(() => {
    if (!canUseUnlimited) return;
    soundEngine.playUiClick();
    soundEngine.stopWind();
    if (playMode === 'unlimited') setPracticeRound((r) => r + 1);
    setPracticeAttempts([]);
    setLiveStationFloat(0);
    setJudgeResult(null);
    setPlayMode('unlimited');
    setPhase('prompt');
  }, [canUseUnlimited, playMode]);

  const handleEndUnlimitedRun = useCallback(() => {
    soundEngine.playUiClick();
    soundEngine.stopWind();
    onExitToHub();
  }, [onExitToHub]);

  const handleAdvanceAfterArrival = useCallback(() => {
    soundEngine.playUiClick();
    if (isUnlimited) {
      setPhase(practiceAttempts.length >= practicePrompts.length ? 'results' : 'prompt');
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
  }, [dateKey, edition, isUnlimited, practiceAttempts.length, practicePrompts.length]);


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
        run={run}
        practice={isUnlimited}
        practiceRound={practiceRound + 1}
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

  const activeTier: RarityTier = judgeResult?.tier ?? 'COMMON';
  const activeSpec = TRAIN_SPECS[activeTier];
  const minimapBase =
    phase === 'arrived'
      ? Math.max(0, baseStations - activeSpec.stations)
      : baseStations;
  const minimapCurrent = phase === 'arrived' ? baseStations : liveStationFloat;
  const currentStationInfo = getStationInfo(edition, minimapCurrent, false);
  const currentBiome = getBiomeForStation(edition, minimapCurrent, false);
  const answeredCount = run.attempts.length;
  const questionNumber = Math.min(
    roundPrompts.length,
    Math.max(1, answeredCount + (phase === 'arrived' ? 0 : 1)),
  );
  // Legs of today's journey for the route map, plus the one being ridden now.
  const routeLegs: RouteLeg[] = [];
  {
    let at = 0;
    for (const a of run.attempts) {
      routeLegs.push({ from: at, to: Math.min(MAX_DAILY_STATIONS, at + a.stations), tier: a.tier });
      at = Math.min(MAX_DAILY_STATIONS, at + a.stations);
    }
    if ((phase === 'arriving' || phase === 'ride') && judgeResult) {
      routeLegs.push({ from: baseStations, to: minimapCurrent, tier: judgeResult.tier });
    }
  }
  const mapExpanded = phase === 'arriving' || phase === 'ride' || phase === 'arrived';
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
                EXIT PRACTICE
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
                ? `R${practiceRound + 1} · Q${questionNumber}/${roundPrompts.length} · ${baseStations} STN`
                : `Q${questionNumber}/${roundPrompts.length} · ${baseStations} STN (${baseStations * POINTS_PER_STATION} PTS)`}
            </div>


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
        {(phase === 'prompt' || phase === 'suspense' || phase === 'reveal' || phase === 'arriving') && (
          <div className="w-full max-w-2xl mx-auto mt-1 mb-auto">
            <div
              className="led-board px-4 py-3 text-center"
              data-testid="departure-board"
            >
              <div className="led-row led-text text-sm sm:text-base tracking-wide mb-1.5 px-2">
                {phase === 'suspense'
                  ? 'CHECKING THE TIMETABLE...'
                  : (phase === 'reveal' || phase === 'arriving') && judgeResult
                    ? (currentAttemptRef.current?.answer ? `"${currentAttemptRef.current.answer.toUpperCase()}"` : 'NO ANSWER')
                    : `#${String(currentStationInfo.index).padStart(2, '0')} ${currentStationInfo.name.toUpperCase()} · ${activePrompt?.category ?? 'DAILY'}`}
              </div>
              <div className="led-row led-text text-xl sm:text-3xl leading-snug px-2 py-1">
                {phase === 'suspense' ? (
                  scrambleText
                ) : (phase === 'reveal' || phase === 'arriving') && judgeResult ? (
                  <FlapText
                    key={`${promptIdx}-${judgeResult.tier}`}
                    text={`${TIER_LABELS[judgeResult.tier].toUpperCase()} · +${activeSpec.stations} STN`}
                    color={TIER_COLORS[judgeResult.tier]}
                  />
                ) : (
                  activePrompt?.prompt
                )}
              </div>
            </div>
          </div>
        )}

        {(
          <div className="absolute right-3 bottom-[150px] xl:right-5 xl:bottom-5 z-[5] pointer-events-none">
            <RouteMap
              edition={edition}
              legs={routeLegs}
              position={minimapCurrent}
              trainTier={judgeResult?.tier ?? run.attempts[run.attempts.length - 1]?.tier ?? 'COMMON'}
              questionNumber={questionNumber}
              totalQuestions={roundPrompts.length}
              expanded={mapExpanded}
            />
          </div>
        )}

        {/* Bottom Zone: Input OR Tier Reveal OR Arrival Card */}
        <div className="w-full max-w-xl mx-auto pointer-events-auto">
          {phase === 'prompt' && wrongGuess && (
            <div
              key={wrongGuess.count}
              className="wrong-shake mb-2 bg-[#16161b] border-2 border-[#e5484d] px-3 py-2 text-center"
              role="status"
              data-testid="wrong-answer"
            >
              <span className="font-pixel text-[11px] text-[#e5484d]">NOT ON THE TIMETABLE</span>
              <span className="text-xs text-[#f2ebdd] ml-2">
                <span className="line-through decoration-[#e5484d]">{wrongGuess.text}</span> isn't right. Try again!
              </span>
            </div>
          )}

          {phase === 'prompt' && (
            <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (correction || checking) return;
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
                      onClick={() => void handleSubmitAnswer(false, correction.typed, true)}
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
              <div
                data-testid="station-clock"
                className={`flex items-center justify-center px-3 min-h-[44px] bg-[#16161b] border-2 font-pixel text-sm tabular-nums ${
                  secondsLeft <= 5 ? 'text-[#e5484d] border-[#e5484d]' : 'text-[#ffb000] border-[#4a4a55]'
                }`}
                aria-label={`${secondsLeft} seconds left`}
              >
                {String(secondsLeft).padStart(2, '0')}S
              </div>
              <button
                type="submit"
                disabled={checking}
                className="n64-btn bg-[#ffb000] text-[#1e1e24] px-4 py-2.5 text-xs font-pixel cursor-pointer whitespace-nowrap min-h-[44px] disabled:opacity-70"
              >
                {checking ? 'CHECKING…' : 'BOARD TRAIN'}
              </button>
            </form>
            <div className="h-2.5 bg-[#16161b] border-x-4 border-b-4 border-[#0e0e12]" aria-hidden="true" data-testid="time-bar">
              <div key={`bar-${promptIdx}-${practiceRound}`} className="time-bar-fill h-full" style={{ animationDuration: `${PROMPT_TIME_SECONDS}s` }} />
            </div>
            </>
          )}

          {(phase === 'reveal' || phase === 'arriving' || phase === 'ride') && judgeResult && (
            <div
              className="n64-panel-warm p-4 text-center space-y-1.5"
              data-testid="tier-reveal-banner"
            >
              <div className="flex items-center justify-center gap-2.5 flex-wrap">
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
                  {answeredCount >= roundPrompts.length
                    ? isUnlimited
                      ? 'SEE THIS ROUND\'S RESULTS'
                      : "SEE TODAY'S RESULTS"
                    : 'CONTINUE THE JOURNEY'}
                </button>
                {isUnlimited && (
                  <button
                    type="button"
                    onClick={handleEndUnlimitedRun}
                    className="n64-btn bg-[#2a2a32] text-[#f2ebdd] px-4 py-2.5 text-xs font-pixel cursor-pointer min-h-[44px]"
                  >
                    EXIT PRACTICE
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

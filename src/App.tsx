/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { HomeScreen } from './components/HomeScreen';
import { ProfileStatsModal } from './components/ProfileStatsModal';
import { loadNextStopSave, loadProfile } from './games/next-stop/storage';
import type { GameEdition, NextStopSaveData } from './games/next-stop/types';
import { verifyEuropeCheckoutSession } from './services/stripeCheckout';
import { applyEditionTheme } from './theme';
import type { PlayerProfile } from './types/arcade';

// The 3D game (three.js + prompt banks) only downloads when you press Play,
// so the home page opens instantly.
const NextStopGame = lazy(() =>
  import('./components/NextStopGame').then((m) => ({ default: m.NextStopGame })),
);

function getInitialEdition(): GameEdition | null {
  if (typeof window === 'undefined') return null;
  const auto = new URLSearchParams(window.location.search).get('autostart');
  if (auto === '1' || auto === 'next-stop') return 'next-stop';
  if (auto === 'europe' || auto === 'next-stop-europe') return 'next-stop-europe';
  return null;
}

function LoadingBoard() {
  return (
    <div className="w-full h-full dot-matrix-bg flex items-center justify-center">
      <p className="font-dot dot-glow text-2xl tracking-widest animate-pulse">
        NEXT TRAIN APPROACHING
      </p>
    </div>
  );
}

export default function App() {
  const [activeEdition, setActiveEdition] = useState<GameEdition | null>(getInitialEdition);
  const [launchMode, setLaunchMode] = useState<'daily' | 'unlimited'>('daily');
  const [profile] = useState<PlayerProfile>(() => loadProfile());
  const [saveData, setSaveData] = useState<NextStopSaveData>(() =>
    loadNextStopSave('next-stop'),
  );
  const [europeSaveData, setEuropeSaveData] = useState<NextStopSaveData>(() =>
    loadNextStopSave('next-stop-europe'),
  );
  const [unlockVersion, setUnlockVersion] = useState(0);
  const [muted, setMuted] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);

  useEffect(() => {
    applyEditionTheme(activeEdition ?? 'next-stop');
  }, [activeEdition]);

  // Verify Stripe Checkout return on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');

    if (checkout === 'success' && sessionId) {
      verifyEuropeCheckoutSession(sessionId).then((res) => {
        if (res.unlocked) {
          setUnlockVersion((v) => v + 1);
          setActiveEdition('next-stop-europe');
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    } else if (checkout === 'cancel') {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleProgressUpdated = useCallback(() => {
    setSaveData(loadNextStopSave('next-stop'));
    setEuropeSaveData(loadNextStopSave('next-stop-europe'));
  }, []);

  const goHome = useCallback(() => {
    soundEngine.stopWind();
    handleProgressUpdated();
    setActiveEdition(null);
  }, [handleProgressUpdated]);

  return (
    <main className="w-screen h-screen overflow-hidden bg-[#1e1e24]">
      {activeEdition ? (
        <Suspense fallback={<LoadingBoard />}>
          <NextStopGame
            key={`${activeEdition}-${launchMode}`}
            edition={activeEdition}
            profile={profile}
            muted={muted}
            launchMode={launchMode}
            onToggleMute={handleToggleMute}
            onExitToHub={goHome}
            onOpenProfileStats={() => setStatsOpen(true)}
            onProfileChange={() => {}}
            onProgressUpdated={handleProgressUpdated}
            onUnlockStateChanged={() => setUnlockVersion((v) => v + 1)}
            onSwitchEdition={(ed) => {
              setLaunchMode('daily');
              setActiveEdition(ed);
            }}
          />
        </Suspense>
      ) : (
        <HomeScreen
          saveData={saveData}
          europeSaveData={europeSaveData}
          unlockVersion={unlockVersion}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPlay={(ed) => {
            soundEngine.stopMenuLoop();
            setLaunchMode('daily');
            setActiveEdition(ed);
          }}
          onPlayUnlimited={() => {
            soundEngine.stopMenuLoop();
            setLaunchMode('unlimited');
            setActiveEdition('next-stop');
          }}
          onOpenStats={() => setStatsOpen(true)}
        />
      )}

      {statsOpen && (
        <ProfileStatsModal
          initialTab="stats"
          profile={profile}
          saveData={saveData}
          europeSaveData={europeSaveData}
          onUpdateProfile={() => {}}
          onClose={() => {
            soundEngine.playUiClick();
            setStatsOpen(false);
          }}
        />
      )}
    </main>
  );
}

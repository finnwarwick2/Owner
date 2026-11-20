import type React from 'react';

export type CharacterColorId =
  | 'cobalt'
  | 'crimson'
  | 'mustard'
  | 'highland'
  | 'midnight'
  | 'royalgold';

export type CharacterHatId =
  | 'station_cap'
  | 'beanie'
  | 'drivers_peak'
  | 'top_hat'
  | 'viking_helm'
  | 'golden_crown';

export type TrainLiveryId =
  | 'heritage'
  | 'br_blue'
  | 'midnight_sleeper'
  | 'sunset_copper'
  | 'neon_shinkansen';

export interface PlayerProfile {
  nickname: string;
  colorId: CharacterColorId;
  hatId: CharacterHatId;
  liveryId: TrainLiveryId;
}

export interface UnlockableOption<T extends string> {
  id: T;
  name: string;
  unlockScore: number;
  primaryHex: string;
  secondaryHex: string;
  description: string;
}

export interface GameDailyStatus {
  played: boolean;
  completed: boolean;
  summaryText: string;
  scoreLabel?: string;
}

export interface GamePlayProps {
  profile: PlayerProfile;
  muted: boolean;
  launchMode?: 'daily' | 'unlimited';
  onToggleMute: () => void;
  onExitToHub: () => void;
  onOpenProfileStats: (initialTab?: 'profile' | 'stats') => void;
  onProfileChange: (profile: PlayerProfile) => void;
  onProgressUpdated: () => void;
  onUnlockStateChanged?: () => void;
}

export interface ArcadeGameModule {
  id: string;
  title: string;
  subtitle: string;
  genre: string;
  playable: boolean;
  isPaidLocked?: () => boolean;
  priceLabel?: string;
  releaseNote?: string;
  cartridgeColors: {
    shell: string;
    labelBg: string;
    labelAccent: string;
    stripe: string;
  };
  getDailyStatus: (dateKey: string) => GameDailyStatus;
  PlayComponent?: React.ComponentType<GamePlayProps>;
}

import React from 'react';
import { Calendar, Trophy, X } from 'lucide-react';
import { CAREER_LINE_MILESTONES } from '../games/next-stop/routes';
import { computeCareerStats } from '../games/next-stop/storage';
import type { NextStopSaveData } from '../games/next-stop/types';
import type { PlayerProfile } from '../types/arcade';

interface ProfileStatsModalProps {
  initialTab: 'profile' | 'stats';
  profile: PlayerProfile;
  saveData: NextStopSaveData;
  europeSaveData?: NextStopSaveData;
  onUpdateProfile: (profile: PlayerProfile) => void;
  onClose: () => void;
}

export const ProfileStatsModal: React.FC<ProfileStatsModalProps> = ({
  initialTab,
  profile,
  saveData,
  europeSaveData,
  onUpdateProfile,
  onClose,
}) => {
  const stats = computeCareerStats(saveData, undefined, europeSaveData);

  // Build 28-day history calendar grid (combining Mainline + Europe score for the day)
  const historyDays: {
    dateKey: string;
    stations: number;
    score: number;
    completed: boolean;
  }[] = [];
  const today = new Date();
  for (let offset = 27; offset >= 0; offset--) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate(),
    ).padStart(2, '0')}`;
    const mainRun = saveData.runsByDate[key];
    const euRun = europeSaveData?.runsByDate[key];
    const stations = (mainRun?.totalStations ?? 0) + (euRun?.totalStations ?? 0);
    const score = (mainRun?.totalScore ?? 0) + (euRun?.totalScore ?? 0);
    historyDays.push({
      dateKey: key,
      stations,
      score,
      completed: Boolean(mainRun?.completed || euRun?.completed),
    });
  }

  const maxCareerScore = CAREER_LINE_MILESTONES[CAREER_LINE_MILESTONES.length - 1].score;
  const careerPct = Math.min(100, (stats.lifetimeScore / maxCareerScore) * 100);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#0e0e12]/85 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Player Profile and Career Stats"
      data-testid="profile-stats-modal"
    >
      <div className="n64-panel w-full max-w-[calc(100vw-16px)] sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden min-w-0">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b-2 border-[#3a3a44] bg-[#19191f] min-w-0">
          <div className="flex items-center gap-2 min-w-0 text-xs font-pixel text-[#ffb000]">
            <Trophy className="w-4 h-4 shrink-0" />
            YOUR STATS
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="n64-btn bg-[#3a3a44] text-[#f2ebdd] p-2 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto overflow-x-hidden p-3.5 sm:p-5 space-y-5 min-w-0">
            <>
              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { label: 'STREAK', value: `${stats.currentStreak}d`, accent: '#ffb000' },
                  { label: 'BEST DAY', value: `${stats.bestDayScore} pts`, accent: '#ffb000' },
                  { label: 'AVG DAY', value: `${stats.averageScore} pts`, accent: '#f2ebdd' },
                  { label: 'STATIONS', value: `${stats.lifetimeStations}`, accent: '#f2ebdd' },
                  { label: 'BULLETS', value: `${stats.bulletTrainsCaught}`, accent: '#ffb000' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-[#16161b] border-2 border-[#3a3a44] p-3 text-center"
                  >
                    <div className="text-[11px] text-[#c9c1b2]">{item.label}</div>
                    <div
                      className="text-sm sm:text-base font-pixel tabular-nums mt-1"
                      style={{ color: item.accent }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Ever-growing Career Line Map */}
              <div className="bg-[#16161b] border-2 border-[#3a3a44] p-3 sm:p-4 space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-arcade">
                  <span className="text-[#ffb000] font-bold">CAREER LINE</span>
                  <span className="text-[#ffb000] font-pixel tabular-nums">
                    {stats.lifetimeScore} PTS · {stats.lifetimeStations} STN
                  </span>
                </div>

                <div className="relative h-3 bg-[#2a2a32] border border-[#4a4a55]">
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-[#ffb000]"
                    style={{ width: `${careerPct}%` }}
                  />
                  {CAREER_LINE_MILESTONES.map((m) => {
                    const left = (m.score / maxCareerScore) * 100;
                    const reached = stats.lifetimeScore >= m.score;
                    return (
                      <div
                        key={m.station}
                        style={{ left: `${left}%` }}
                        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 border border-[#0e0e12] ${
                          reached ? 'bg-[#ffb000]' : 'bg-[#4a4a55]'
                        }`}
                        title={`${m.station} (${m.score} pts)`}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-[10px]">
                  {CAREER_LINE_MILESTONES.filter((_, idx) => idx % 2 === 0).map((m) => {
                    const reached = stats.lifetimeScore >= m.score;
                    return (
                      <div
                        key={m.station}
                        className={`min-w-0 ${reached ? 'text-[#f2ebdd]' : 'text-[#6e695f]'}`}
                      >
                        <div className="font-bold truncate">{m.station}</div>
                        <div className="tabular-nums">{m.score} pts</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 28-Day History Calendar */}
              <div className="bg-[#16161b] border-2 border-[#3a3a44] p-3 sm:p-4 space-y-2.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-arcade text-[#ffb000]">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    28-DAY LOG
                  </span>
                  <span className="text-[#9a9386] tabular-nums">
                    {stats.daysCompleted} DAYS DONE
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                  {historyDays.map((day) => {
                    const intensity =
                      !day.completed && day.score === 0
                        ? 'bg-[#26262e] border-[#3a3a44] text-[#4a4a55]'
                        : day.score >= 250
                          ? 'bg-[#a86f00] border-[#ffb000] text-[#f2ebdd]'
                          : day.score >= 120
                            ? 'bg-[#5c3c00] border-[#ffb000] text-[#f2ebdd]'
                            : 'bg-[#a86f00] border-[#ffb000] text-[#f2ebdd]';
                    return (
                      <div
                        key={day.dateKey}
                        title={`${day.dateKey}: ${day.stations} stn (${day.score} pts)`}
                        className={`border p-1.5 text-center tabular-nums ${intensity}`}
                      >
                        <div className="text-[10px] opacity-90">{day.dateKey.slice(8)}</div>
                        <div className="text-xs font-bold">
                          {day.score > 0 ? `${day.score}` : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
        </div>
      </div>
    </div>
  );
};

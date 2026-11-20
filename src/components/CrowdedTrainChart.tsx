import React, { useEffect, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { CHARACTER_COLORS } from '../games/next-stop/storage';
import {
  SCORE_BUCKET_LABELS,
  type DailyDistributionResult,
} from '../services/scoreDistribution';
import type { PlayerProfile } from '../types/arcade';

interface CrowdedTrainChartProps {
  distribution: DailyDistributionResult | null;
  playerScore: number;
  profile: PlayerProfile;
  loading: boolean;
}

const CANVAS_W = 960;
const CANVAS_H = 260;

export const CrowdedTrainChart: React.FC<CrowdedTrainChartProps> = ({
  distribution,
  playerScore,
  profile,
  loading,
}) => {
  const [showOverlay, setShowOverlay] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const buckets = distribution?.buckets ?? [4, 10, 22, 36, 44, 30, 18, 8, 4, 2];
  const playerBucket = distribution?.playerBucket ?? Math.min(9, Math.floor(playerScore / 40));
  const percentileBeat = distribution?.percentileBeat ?? 50;
  const simulated = distribution?.simulated ?? true;
  const totalPlayers = distribution?.totalPlayers ?? buckets.reduce((a, b) => a + b, 0);

  const playerColor =
    CHARACTER_COLORS.find((c) => c.id === profile.colorId)?.primaryHex ?? '#3a3a44';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let startTime = performance.now();

    const drawPixelPassenger = (
      x: number,
      y: number,
      coatColor: string,
      opts: {
        squashed?: boolean;
        armRaised?: boolean;
        sweat?: boolean;
        headInArmpit?: boolean;
        readingPaper?: boolean;
        sleeping?: boolean;
        isPlayer?: boolean;
        bob?: number;
      },
    ) => {
      const py = Math.round(y + (opts.bob ?? 0));
      const px = Math.round(x);

      // Legs
      ctx.fillStyle = '#2a2a32';
      ctx.fillRect(px - 3, py - 8, 2, 8);
      ctx.fillRect(px + 1, py - 8, 2, 8);

      // Coat / Torso
      ctx.fillStyle = coatColor;
      const w = opts.squashed ? 7 : 8;
      ctx.fillRect(px - Math.floor(w / 2), py - 19, w, 11);

      // Head (shifted slightly if head-in-armpit!)
      const headOffsetX = opts.headInArmpit ? -3 : 0;
      const headOffsetY = opts.headInArmpit ? 2 : 0;
      ctx.fillStyle = '#c9c1b2';
      ctx.fillRect(px - 3 + headOffsetX, py - 26 + headOffsetY, 6, 7);

      // Eyes
      ctx.fillStyle = '#19191f';
      if (opts.sleeping) {
        ctx.fillRect(px - 2 + headOffsetX, py - 23 + headOffsetY, 4, 1);
      } else {
        ctx.fillRect(px - 2 + headOffsetX, py - 24 + headOffsetY, 1, 2);
        ctx.fillRect(px + 1 + headOffsetX, py - 24 + headOffsetY, 1, 2);
      }

      // Hat or Hair
      if (opts.isPlayer) {
        ctx.fillStyle = '#ffb000';
        ctx.fillRect(px - 4, py - 29, 8, 4);
        // Leather briefcase in hand
        ctx.fillStyle = '#8e1828';
        ctx.fillRect(px + 4, py - 11, 5, 6);
        ctx.fillStyle = '#ffb000';
        ctx.fillRect(px + 6, py - 11, 2, 1);
      } else {
        ctx.fillStyle = '#3a3a44';
        ctx.fillRect(px - 3 + headOffsetX, py - 28 + headOffsetY, 6, 2);
      }

      // Raised arm holding overhead rail
      if (opts.armRaised) {
        ctx.fillStyle = coatColor;
        ctx.fillRect(px + 3, py - 29, 2, 11);
      }

      // Sweat drop on squashed commuters
      if (opts.sweat) {
        ctx.fillStyle = '#ffb000';
        ctx.fillRect(px + 4, py - 27, 2, 3);
      }

      // Newspaper in quiet carriage
      if (opts.readingPaper) {
        ctx.fillStyle = '#f2ebdd';
        ctx.fillRect(px + 2, py - 20, 7, 8);
        ctx.fillStyle = '#9a9386';
        ctx.fillRect(px + 3, py - 18, 5, 1);
        ctx.fillRect(px + 3, py - 15, 5, 1);
      }

      // Floating zZz when napping
      if (opts.sleeping) {
        ctx.fillStyle = '#c9c1b2';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('zZ', px + 4, py - 30);
      }
    };

    const renderFrame = (now: number) => {
      const t = (now - startTime) / 1000;
      ctx.imageSmoothingEnabled = false;

      // Sky backdrop
      ctx.fillStyle = '#19191f';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Distant pixel stars / skyline silhouette
      ctx.fillStyle = '#26262e';
      for (let i = 0; i < 16; i++) {
        const sx = (i * 78 + 20) % CANVAS_W;
        const sh = 24 + ((i * 37) % 45);
        ctx.fillRect(sx, 178 - sh, 42, sh);
      }

      // Track ballast & sleepers (scroll softly to show the train moving)
      ctx.fillStyle = '#26262e';
      ctx.fillRect(0, 204, CANVAS_W, 56);
      ctx.fillStyle = '#9a9386';
      ctx.fillRect(0, 200, CANVAS_W, 4);
      const sleeperShift = Math.floor((t * 48) % 24);
      ctx.fillStyle = '#5c3c00';
      for (let sx = -sleeperShift; sx < CANVAS_W; sx += 24) {
        ctx.fillRect(sx, 205, 10, 5);
      }

      const maxCount = Math.max(1, ...buckets);
      const carWidth = 74;
      const carGap = 4;
      const startX = 14;
      const baseY = 196;
      const chugY = Math.round(Math.sin(t * 10) * 1.2);

      // Draw 10 carriages (0 = back left 0-39 ... 9 = front right 360-400)
      for (let c = 0; c < 10; c++) {
        const cx = startX + c * (carWidth + carGap);
        const cy = 96 + (c % 2 === 0 ? chugY : -chugY);
        const count = buckets[c] ?? 0;
        const ratio = count / maxCount;
        const isPlayerCar = c === playerBucket;

        // Coupler to next carriage
        ctx.fillStyle = '#19191f';
        ctx.fillRect(cx + carWidth, cy + 72, carGap + 2, 6);

        // Undercarriage & spinning wheels
        ctx.fillStyle = '#2a2a32';
        ctx.fillRect(cx + 4, cy + 84, carWidth - 8, 8);
        for (const wx of [cx + 16, cx + carWidth - 16]) {
          ctx.fillStyle = '#4a4a55';
          ctx.beginPath();
          ctx.arc(wx, baseY, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#c9c1b2';
          const spokeX = Math.cos(t * 9 + c) * 3;
          const spokeY = Math.sin(t * 9 + c) * 3;
          ctx.fillRect(wx + spokeX - 1, baseY + spokeY - 1, 2, 2);
        }

        // Carriage shell
        ctx.fillStyle = isPlayerCar ? '#3a3a44' : '#3a3a44';
        ctx.fillRect(cx, cy, carWidth, 86);
        ctx.strokeStyle = isPlayerCar ? '#ffb000' : '#4a4a55';
        ctx.lineWidth = isPlayerCar ? 3 : 2;
        ctx.strokeRect(cx, cy, carWidth, 86);

        // Carriage roof
        ctx.fillStyle = isPlayerCar ? '#ffb000' : '#6e695f';
        ctx.fillRect(cx - 2, cy - 5, carWidth + 4, 6);

        // Window opening (interior lit)
        const winX = cx + 6;
        const winY = cy + 14;
        const winW = carWidth - 12;
        const winH = 44;
        ctx.fillStyle = ratio >= 0.65 ? '#ffd27a' : '#f2ebdd';
        ctx.fillRect(winX, winY, winW, winH);

        // Overhead grab rail inside carriage
        ctx.fillStyle = '#6e695f';
        ctx.fillRect(winX + 2, winY + 6, winW - 4, 2);

        // Draw passengers proportional to bucket density
        const passengerCount =
          count === 0
            ? 0
            : Math.max(1, Math.min(17, Math.round(1 + ratio * 16)));
        const coatPalette = [
          '#d72638',
          '#ffb000',
          '#ffb000',
          '#a86f00',
          '#ffb000',
          '#d72638',
        ];
        const floorY = winY + winH;

        const isPacked = ratio >= 0.65;
        const isQuiet = ratio < 0.28;

        for (let p = 0; p < passengerCount; p++) {
          // Leave room for player if this is the player's carriage
          if (isPlayerCar && p === Math.floor(passengerCount / 2)) continue;
          const slotX =
            passengerCount === 1
              ? winX + winW * 0.35
              : winX + 7 + (p / Math.max(1, passengerCount - 1)) * (winW - 14);
          const coat = coatPalette[(c * 3 + p) % coatPalette.length];
          const bob = isPacked
            ? Math.sin(t * 9 + p) * 0.8
            : Math.sin(t * 2.5 + p) * 0.4;

          drawPixelPassenger(slotX, floorY, coat, {
            squashed: isPacked,
            armRaised: isPacked && p % 2 === 0,
            sweat: isPacked && p % 3 === 1 && Math.sin(t * 6 + p) > 0,
            headInArmpit: isPacked && p % 4 === 2,
            readingPaper: isQuiet && p % 2 === 0,
            sleeping: isQuiet && p % 2 === 1,
            bob,
          });
        }

        // Draw Player with briefcase inside their carriage
        if (isPlayerCar) {
          const px = winX + winW * 0.5;
          drawPixelPassenger(px, floorY, playerColor, {
            isPlayer: true,
            squashed: isPacked,
            armRaised: isPacked,
            bob: Math.sin(t * 5) * 1.1,
          });

          // Pulsing "YOU — SCORE" callout above the carriage
          const arrowBob = Math.round(Math.sin(t * 6) * 3);
          ctx.fillStyle = '#16161b';
          ctx.fillRect(cx - 3, 14 + arrowBob, carWidth + 6, 24);
          ctx.fillStyle = '#ffb000';
          ctx.fillRect(cx - 1, 16 + arrowBob, carWidth + 2, 20);
          ctx.fillStyle = '#19191f';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`YOU — ${playerScore}`, cx + carWidth / 2, 30 + arrowBob);
          // Arrow triangle
          ctx.fillStyle = '#ffb000';
          ctx.beginPath();
          ctx.moveTo(cx + carWidth / 2 - 6, 39 + arrowBob);
          ctx.lineTo(cx + carWidth / 2 + 6, 39 + arrowBob);
          ctx.lineTo(cx + carWidth / 2, 48 + arrowBob);
          ctx.closePath();
          ctx.fill();
        }

        // Window frame mullions
        ctx.strokeStyle = '#2a2a32';
        ctx.lineWidth = 2;
        ctx.strokeRect(winX, winY, winW, winH);

        // Score bucket label on dark high-contrast plate
        ctx.fillStyle = '#16161b';
        ctx.fillRect(cx + 6, cy + 62, carWidth - 12, 18);
        ctx.fillStyle = isPlayerCar ? '#ffb000' : '#f2ebdd';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(SCORE_BUCKET_LABELS[c], cx + carWidth / 2, cy + 75);
      }

      // Draw Locomotive on the right (+X front)
      const locoX = startX + 10 * (carWidth + carGap) + 2;
      const locoY = 82 + chugY;
      ctx.fillStyle = '#8e1828';
      ctx.fillRect(locoX, locoY + 14, 78, 86);
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(locoX, locoY + 56, 94, 12);
      // Sloped nose
      ctx.fillStyle = '#d72638';
      ctx.beginPath();
      ctx.moveTo(locoX + 78, locoY + 14);
      ctx.lineTo(locoX + 102, locoY + 52);
      ctx.lineTo(locoX + 102, locoY + 100);
      ctx.lineTo(locoX + 78, locoY + 100);
      ctx.closePath();
      ctx.fill();
      // Cab window & headlamp beam
      ctx.fillStyle = '#ffb000';
      ctx.fillRect(locoX + 54, locoY + 24, 22, 22);
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
      ctx.beginPath();
      ctx.moveTo(locoX + 102, locoY + 62);
      ctx.lineTo(locoX + 140, locoY + 42);
      ctx.lineTo(locoX + 140, locoY + 86);
      ctx.closePath();
      ctx.fill();
      // Loco wheels
      for (const lx of [locoX + 18, locoX + 50, locoX + 82]) {
        ctx.fillStyle = '#4a4a55';
        ctx.beginPath();
        ctx.arc(lx, baseY, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Optional Bell-Curve Spline & Bucket Count Overlay
      if (showOverlay) {
        const points = buckets.map((cnt, idx) => {
          const px = startX + idx * (carWidth + carGap) + carWidth / 2;
          const normH = cnt / maxCount;
          const py = 148 - normH * 94;
          return { x: px, y: py, cnt };
        });

        // Semi-transparent backdrop band
        ctx.fillStyle = 'rgba(12, 16, 27, 0.36)';
        ctx.fillRect(0, 38, startX + 10 * (carWidth + carGap), 124);

        // Smooth spline curve
        ctx.strokeStyle = '#ffb000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        points.forEach((pt, idx) => {
          if (idx === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            const prev = points[idx - 1];
            const midX = (prev.x + pt.x) / 2;
            ctx.quadraticCurveTo(prev.x, prev.y, midX, (prev.y + pt.y) / 2);
            if (idx === points.length - 1) {
              ctx.lineTo(pt.x, pt.y);
            }
          }
        });
        ctx.stroke();

        // Data nodes & bucket counts
        points.forEach((pt, idx) => {
          const isMe = idx === playerBucket;
          ctx.fillStyle = isMe ? '#ffb000' : '#ffb000';
          ctx.fillRect(pt.x - 4, pt.y - 4, 8, 8);
          ctx.fillStyle = '#16161b';
          ctx.fillRect(pt.x - 17, pt.y - 24, 34, 16);
          ctx.strokeStyle = isMe ? '#ffb000' : '#ffb000';
          ctx.lineWidth = 1;
          ctx.strokeRect(pt.x - 17, pt.y - 24, 34, 16);
          ctx.fillStyle = isMe ? '#ffb000' : '#f2ebdd';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(pt.cnt), pt.x, pt.y - 12);
        });
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [buckets, playerBucket, playerScore, playerColor, showOverlay]);

  return (
    <div className="n64-panel p-4 space-y-3" data-testid="crowded-train-section">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-pixel text-[#ffb000]">
              THE CROWDED TRAIN
            </h2>
            <span
              data-testid="distribution-source-badge"
              className={`px-2 py-0.5 text-[9px] font-pixel border ${
                simulated
                  ? 'bg-[#5c3c00] text-[#ffd27a] border-[#ffb000]'
                  : 'bg-[#5c3c00] text-[#f2ebdd] border-[#ffb000]'
              }`}
            >
              {loading ? 'LOADING...' : simulated ? 'SIMULATED' : 'LIVE'}
            </span>
          </div>
          <p
            className="text-sm sm:text-base font-pixel text-[#ffb000] mt-1 tabular-nums"
            data-testid="percentile-callout"
          >
            You beat {percentileBeat}% of players today
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowOverlay((v) => !v)}
          data-testid="bell-curve-toggle"
          aria-pressed={showOverlay}
          className={`n64-btn px-3 py-2 text-[10px] font-pixel flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            showOverlay
              ? 'bg-[#ffb000] text-[#1e1e24]'
              : 'bg-[#2a2a32] text-[#f2ebdd]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          {showOverlay ? 'HIDE BELL CURVE' : 'BELL CURVE OVERLAY'}
        </button>
      </div>

      {/* Horizontally scrollable 10-carriage side-on train */}
      <div
        className="overflow-x-auto border-2 border-[#3a3a44] bg-[#16161b]"
        data-testid="crowded-train-scroll"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="pixel-canvas block min-w-[780px] md:min-w-0 w-full h-[215px] sm:h-[245px]"
          aria-label={`Crowded train score distribution showing ${totalPlayers} players across 10 carriages`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] sm:text-xs text-[#c9c1b2]">
        <span>
          ← 0–39 (Back) to 360–400 (Front) · Scroll sideways on mobile
        </span>
        <span className="tabular-nums">
          {totalPlayers} commuters aboard today · Your carriage: {SCORE_BUCKET_LABELS[playerBucket]}
        </span>
      </div>
    </div>
  );
};

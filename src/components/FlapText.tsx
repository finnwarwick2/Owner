import React, { useEffect, useState } from 'react';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#+';

/**
 * Split-flap style reveal: every letter spins through random glyphs, then
 * settles one by one from left to right, like a station departure board.
 */
export const FlapText: React.FC<{ text: string; color?: string; stepMs?: number }> = ({
  text,
  color,
  stepMs = 45,
}) => {
  const [frame, setFrame] = useState(0);
  const settleAt = (i: number) => 8 + i * 2;
  const total = settleAt(text.length) + 1;
  useEffect(() => {
    if (frame >= total) return;
    const id = window.setTimeout(() => setFrame((f) => f + 1), stepMs);
    return () => window.clearTimeout(id);
  }, [frame, total, stepMs]);

  const shown = Array.from(text, (ch, i) => {
    if (ch === ' ' || frame >= settleAt(i)) return ch;
    return GLYPHS[(i * 7 + frame * 13) % GLYPHS.length];
  }).join('');

  return (
    <span
      aria-label={text}
      style={color ? { color, textShadow: `0 0 8px ${color}99, 0 0 18px ${color}44` } : undefined}
    >
      {shown}
    </span>
  );
};

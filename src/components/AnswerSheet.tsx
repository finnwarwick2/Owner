import React, { useMemo } from 'react';
import { getAnswerSheet } from '../games/next-stop/daily';
import { EUROPE_PROMPT_BANK } from '../games/next-stop/europePrompts';
import { PROMPT_BANK } from '../games/next-stop/prompts';
import {
  TIER_COLORS,
  TIER_LABELS,
  TRAIN_SPECS,
  type PromptAttempt,
} from '../games/next-stop/types';

const ALL_PROMPTS = new Map([...PROMPT_BANK, ...EUROPE_PROMPT_BANK].map((p) => [p.id, p]));

/** End-of-day reveal: the Bullet-winning answer and the top answers at every level. */
export const AnswerSheet: React.FC<{ attempts: PromptAttempt[] }> = ({ attempts }) => {
  const sheets = useMemo(
    () =>
      attempts.map((att) => {
        const prompt = ALL_PROMPTS.get(att.promptId);
        return { att, sheet: prompt ? getAnswerSheet(prompt, 10) : null };
      }),
    [attempts],
  );

  return (
    <section className="flex flex-col gap-3" data-testid="answer-sheet">
      <div className="n64-panel-warm px-4 py-3">
        <h2 className="text-sm sm:text-base font-pixel text-[#ffb000]">THE ANSWER SHEET</h2>
        <p className="text-xs sm:text-sm text-[#c9c1b2] mt-1">
          What would have caught the Bullet on each of today's questions, plus the top answers at every level.
        </p>
      </div>

      {sheets.map(({ att, sheet }, idx) => {
        const yours = TRAIN_SPECS[att.tier];
        return (
          <article key={`${att.promptId}-${idx}`} className="n64-panel p-3.5 sm:p-4 space-y-3">
            <div className="text-[11px] text-[#c9c1b2] flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-pixel text-[#ffb000]">Q{idx + 1}</span>
              <span>{att.category}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#f2ebdd]">{att.promptText}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1 min-w-0 bg-[#16161b] border-2 border-[#3a3a44] px-3 py-2">
                <div className="text-[10px] font-pixel text-[#9a9386]">YOUR ANSWER</div>
                <div className="flex flex-wrap items-baseline gap-2 mt-0.5">
                  <span className="text-sm font-bold text-[#f2ebdd] break-words">
                    {att.answer ? att.answer : '(no answer)'}
                  </span>
                  <span className="text-[11px] font-pixel" style={{ color: TIER_COLORS[att.tier] }}>
                    {TIER_LABELS[att.tier].toUpperCase()} · +{yours.stations} STN
                  </span>
                </div>
              </div>
              <div
                className="flex-1 min-w-0 bg-[#16161b] border-2 px-3 py-2"
                style={{ borderColor: TIER_COLORS[sheet?.bulletTier ?? 'LEGENDARY'] }}
              >
                <div className="text-[10px] font-pixel" style={{ color: TIER_COLORS[sheet?.bulletTier ?? 'LEGENDARY'] }}>
                  {sheet?.bulletTier === 'LEGENDARY'
                    ? 'BULLET TRAIN ANSWER · +8 STN'
                    : sheet?.bulletTier
                      ? `BEST ANSWER · ${TIER_LABELS[sheet.bulletTier].toUpperCase()} · +${TRAIN_SPECS[sheet.bulletTier].stations} STN`
                      : 'BEST ANSWER'}
                </div>
                <div className="text-base sm:text-lg font-bold text-[#ffd27a] mt-0.5 break-words">
                  {sheet?.bullet ?? '—'}
                </div>
              </div>
            </div>

            {sheet && (
              <details className="group">
                <summary className="cursor-pointer select-none text-[11px] font-pixel text-[#c9c1b2] hover:text-[#ffb000] list-none flex items-center gap-1.5">
                  <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
                  TOP ANSWERS AT EVERY LEVEL
                </summary>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {sheet.tiers.map(({ tier, answers }) => (
                    <div key={tier} className="min-w-0 bg-[#16161b] border-t-4 px-2.5 py-2" style={{ borderColor: TIER_COLORS[tier] }}>
                      <div className="text-[10px] font-pixel mb-1.5" style={{ color: TIER_COLORS[tier] }}>
                        {TIER_LABELS[tier].toUpperCase()} · {TRAIN_SPECS[tier].stations} STN
                      </div>
                      {answers.length ? (
                        <ol className="text-xs text-[#f2ebdd] space-y-0.5 list-decimal pl-5 marker:text-[#6e695f]">
                          {answers.map((a) => (
                            <li key={a} className="break-words">{a}</li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-xs text-[#6e695f]">None at this level</p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        );
      })}
    </section>
  );
};

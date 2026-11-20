# Next Stop

A daily trivia train game. Answer 5 prompts a day; the more obscure (but still correct) your answer, the more stations your train skips on the line from Waterloo Depot to Grand Terminus.

## Play

The `main` branch deploys automatically to GitHub Pages (see `.github/workflows/pages.yml`).

On GitHub Pages, answers are graded by the built-in offline judge (`src/games/next-stop/daily.ts`) and the "Crowded Train" chart uses a simulated crowd. When the same build runs as a claude.ai artifact, it uses Claude as the judge and a shared score store instead (`src/platform/claude.ts`).

## Run locally

```bash
npm ci --legacy-peer-deps
npx vite
```

## Project layout

- `src/games/next-stop/promptsNiche.ts` — the daily prompt bank and the answer lists the offline judge uses
- `src/three/` — the 3D scene (crisp foreground, dithered countryside background)
- `src/components/` — screens: home, game, results, stats
- `server.ts` — optional Express server with a Gemini judge and Stripe checkout (not used by the Pages build)

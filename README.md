# LearnIt!

AI-powered language learning app. Practice with LLM-generated exercises, build vocabulary, and track your goals and streaks.

LearnIt! is a full-stack language learning application. The frontend (Astro + React 19) renders a set of SPA pages — learning, exercises, vocabulary, speaking, goals, and settings — while a Bun-native Elysia API persists progress in MongoDB and generates personalized content with Deepseek through the OpenAI-compatible SDK.

## Features

- **Learning paths** — LLM-generated personalized curriculum for any language, objective, and timeframe
- **Exercises** — Multiple choice, fill-in-the-blank, and translation exercises, with a prefetch queue that keeps the next 2 ready while you practice
- **"I don't know"** — Request an AI explanation focused on the underlying concept, delivered in your native language, when stuck
- **Translate** — Reveal the meaning of any exercise phrase on demand
- **Vocabulary** — Save words with auto-generated conjugations and usage examples
- **Speak** — Listen to phrases and practice pronunciation via the Web Speech API
- **Goals & streaks** — Set learning goals and track your daily streak
- **Settings** — Switch the active learning path and the explanation (native) language

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Astro 7, React 19, TailwindCSS v4, shadcn/ui-style primitives, Motion, Sonner |
| Backend | Elysia (Bun-native), MongoDB, Zod |
| AI | Deepseek via the OpenAI-compatible SDK |
| Runtime | Bun |
| Tooling | TypeScript, oxlint, oxfmt |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- MongoDB running locally (or an Atlas connection string)
- Deepseek API key — [platform.deepseek.com](https://platform.deepseek.com/)

### Install

```bash
bun install
cd api && bun install
```

### Configure

```bash
cp api/.env.example api/.env
# Edit api/.env — set DEEPSEEK_API_KEY (and MONGO_URI / DB_NAME if needed)
```

### Run

Two terminals:

```bash
# Terminal 1 — frontend (http://localhost:4321)
bun dev

# Terminal 2 — API (http://localhost:3001)
bun run api
```

The frontend points to the API through `src/lib/api.ts`, which defaults to `http://localhost:3001` and can be overridden with the `VITE_API_URL` environment variable.

## Project structure

```
learnit/
├── src/
│   ├── components/     # React page components + ui primitives
│   ├── layouts/        # Astro layouts
│   ├── lib/api.ts      # Typed fetch client
│   ├── pages/          # Astro routes
│   └── styles/         # Global styles
└── api/
    └── src/
        ├── index.ts    # Elysia routes (goals, streaks, vocabulary, paths, exercises, progress)
        ├── prompts.ts  # LLM prompt builders
        ├── llm.ts      # Deepseek client (OpenAI-compatible)
        ├── db.ts       # MongoDB connection
        ├── preload.ts  # Startup preload (env, client init)
        └── schemas.ts  # Zod schemas
```

## Scripts

```bash
bun dev            # Astro dev server
bun run api        # Elysia API server
bun run typecheck  # tsc --noEmit
bun run lint       # oxlint
bun run format     # oxfmt
```

## License

Apache-2.0

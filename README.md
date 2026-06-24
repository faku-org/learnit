# LearnIt!

AI-powered language learning app. Practice with generated exercises, build vocabulary, and track your progress.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Astro v7, React 19, TailwindCSS v4, shadcn/ui, motion/react |
| Backend | Elysia (Bun-native), MongoDB |
| AI | Deepseek via OpenAI-compatible SDK |
| Runtime | Bun |

## Features

- **Learning paths** — LLM-generated personalized curriculum for any language and goal
- **Exercises** — Multiple choice, fill-in-the-blank, and translation with preloading (2 ahead)
- **"I don't know"** — Request an AI explanation with key points and examples when stuck
- **Translate** — Reveal the meaning of any exercise phrase on demand
- **Vocabulary** — Save words with auto-generated conjugations and usage examples
- **Speak** — Listen to phrases and practice pronunciation via Web Speech API
- **Settings** — Switch active learning path and explanation language

## Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- MongoDB running locally (or Atlas URI)
- Deepseek API key — [platform.deepseek.com](https://platform.deepseek.com/)

### Install

```bash
bun install
cd api && bun install
```

### Configure

```bash
cp api/.env.example api/.env
# Edit api/.env — set DEEPSEEK_API_KEY at minimum
```

### Run

Two terminals:

```bash
# Terminal 1 — frontend (http://localhost:4321)
bun dev

# Terminal 2 — API (http://localhost:3001)
bun run api
```

## Project structure

```
learnit/
├── src/
│   ├── components/     # React page components + shadcn/ui
│   ├── layouts/        # Astro layouts
│   ├── pages/          # Astro routes
│   └── lib/api.ts      # Typed fetch client
└── api/
    └── src/
        ├── index.ts    # Elysia routes
        ├── prompts.ts  # LLM prompt builders
        ├── llm.ts      # Deepseek client
        ├── db.ts       # MongoDB connection
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

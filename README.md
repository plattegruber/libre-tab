# Libre Tab

**Free, open-source guitar and bass tablature for everyone.**

Libre Tab is a community-driven platform for creating, sharing, and collaborating on guitar and bass tabs. No ads. No paywalls. No premium tiers. Every tab is free to read, free to edit, and free to fork — forever.

## Why

The tab ecosystem is broken. The major tab sites lock accurate transcriptions behind subscriptions, plaster pages with ads, and store everything in proprietary formats you can't export, modify, or self-host. Contributors do the work; platforms capture the value.

Libre Tab inverts that. The entire platform — the editor, the renderer, the data model, the server — is open source. Tabs are structured data, not trapped in someone else's database. The community owns the corpus.

## How It Works

### Collaborative editing with semantic history

Tabs aren't static documents. They're living transcriptions that improve over time as players debate technique, correct mistakes, and refine interpretations. Libre Tab treats every edit as a **semantic operation** — "bend curve updated on measure 4, beat 2" — not a text diff. Full rollback, meaningful changelogs, and per-layer versioning come for free.

### Layered data model

The [data model](docs/data-model-spec.md) separates musical truth from interpretation:

```
song
├── base            — notes: string, fret, duration, voice
├── techniques      — bends, slides, hammer-ons, harmonics, ...
├── phrasing        — slurs, ties, dynamics, phrase marks
├── harmony         — chord symbols
├── fingering       — left/right hand annotations
├── structure       — sections, repeats, navigation marks
└── ...             — lyrics, tuplets, context (tempo, time sig)
```

Each layer is independently editable, versionable, and diffable. Two contributors can disagree on fingering without either being wrong about the notes. Technique interpretation — the part the community actually debates — lives in its own layer, separate from the stable base of what frets get played.

### Presentation is a rendering concern

The model stores what fingers do. How that gets displayed — tab staff, standard notation, chord chart, ASCII — is derived at render time. One source of truth, many views.

### Tab-native

Pitch is never stored. It's always derived: `tuning[string] + capo + fret`. The model thinks in strings and frets, not in concert pitch. This is a guitar tool, not a general-purpose notation editor that happens to support tab.

## Instruments

- Electric and acoustic guitar (6, 7, 8 string)
- Bass (4, 5, 6 string)
- Ukulele
- Banjo
- Mandolin

Arbitrary tunings and capo positions per track. Multi-track songs (lead, rhythm, bass) are first-class.

## Planned Features

- **Web editor** — interactive tab editor in the browser with real-time collaboration
- **Playback engine** — hear what you're reading, synced to the notation
- **Import** — Guitar Pro (.gp, .gp5, .gpx), MusicXML, Power Tab, TuxGuitar
- **Export** — PDF, MusicXML, MIDI, ASCII tab, Libre Tab's native JSON format
- **Community contributions** — propose edits, vote on technique interpretations, fork tabs
- **Search and discovery** — browse by artist, genre, tuning, difficulty, technique
- **Practice tools** — looping, speed control, isolated track playback
- **Self-hostable** — run your own instance with your own corpus
- **API** — programmatic access to the full tab corpus

## Project Status

Early development. The [data model spec](docs/data-model-spec.md) is the current foundation — a working draft defining the layered architecture, type system, and edit model. Implementation is next.

**Production:** https://libre-tab.<your-subdomain>.workers.dev _(update with the real URL after first deploy)_

## Development

### Prerequisites

- Node.js 22 (see `.nvmrc`)
- pnpm 9 (auto-installed via Corepack from the `packageManager` field)

### Run locally

```bash
pnpm install
pnpm dev
```

The dev server starts at http://localhost:5173.

### Typecheck, lint, and build

```bash
pnpm check    # svelte-check
pnpm lint     # prettier --check + eslint
pnpm build    # production build via Cloudflare adapter
```

## Deployment

Deployed to **Cloudflare Workers** (with static assets) as the `libre-tab` Worker. Cloudflare's Git integration ("Workers Builds") owns building and deploying — every push to `main` triggers a build inside Cloudflare, so there is no separate deploy workflow in this repo.

### Worker config

`apps/web/wrangler.jsonc` is the source of truth for the Worker. It points `main` at the SvelteKit Cloudflare adapter output (`.svelte-kit/cloudflare/_worker.js`) and binds the same directory as the static `ASSETS` source. `apps/web/scripts/write-assetsignore.mjs` runs as part of `pnpm --filter web build` and writes a `.assetsignore` so Wrangler doesn't try to upload `_worker.js` itself as a public asset.

### Cloudflare Workers Builds settings

Configure these once in the Cloudflare dashboard under the Worker's **Settings → Builds** tab:

| Field            | Value                                              |
| ---------------- | -------------------------------------------------- |
| Root directory   | `/`                                                |
| Build command    | `pnpm install --frozen-lockfile && pnpm --filter web build` |
| Deploy command   | `pnpm --filter web exec wrangler deploy`           |
| Branch           | `main` (production); other branches deploy as preview environments |

Cloudflare Workers Builds reads `apps/web/wrangler.jsonc` automatically because the deploy command runs from `apps/web`.

### Manual deploys from a local clone

```bash
pnpm install
pnpm --filter web build
pnpm --filter web exec wrangler deploy
```

(`wrangler login` first if not already authenticated.)

## Contributing

Libre Tab is built in the open. If you're interested in helping — whether that's the editor, renderer, data layer, infrastructure, or just reviewing the spec — open an issue or submit a PR.

## License

AGPL-3.0 — free as in freedom. The source stays open, including for hosted deployments.

# Ropecon Game Finder

A Bun workspace containing the static Astro finder, its privacy-safe program-data core,
and the Cloud Run refresh job that publishes normalized data to Cloud Storage.

## Development

```sh
bun install
PUBLIC_PROGRAM_DATA_URL=https://storage.googleapis.com/<bucket>/program.json bun run dev
bun run test
bun run typecheck
PUBLIC_PROGRAM_DATA_URL=https://storage.googleapis.com/<bucket>/program.json bun run build:web
bun run build:job
```

The web build requires `PUBLIC_PROGRAM_DATA_URL`, but never contacts that URL while
building. Set the same variable in Netlify. The refresh job requires `PROGRAM_BUCKET`;
`PROGRAM_OBJECT` defaults to `program.json`, and credentials use Google Application
Default Credentials.

Build the job container from the repository root:

```sh
docker build -f apps/program-refresh/Dockerfile .
```

Architecture and operating constraints are documented in
[`docs/ropecon-gaming-finder-session-primer-v7.md`](docs/ropecon-gaming-finder-session-primer-v7.md).

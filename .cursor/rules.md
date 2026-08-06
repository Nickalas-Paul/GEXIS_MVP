# GEXIS Project Rules

## Workflow Discipline
- ALWAYS audit before implementing. Every task starts with a diagnostic prompt that analyzes the current state of the repo before any code is written or modified.
- Three failed fixes on the same issue = wrong root-cause assumption. Stop patching. Run a fresh diagnostic audit before any more code changes.
- Phase exit criteria must be met before moving to the next phase.

## Architecture
- Monorepo managed by Turborepo
- Universal client: Expo Router (single codebase for web + native)
- Server: Express API with PostgreSQL + PostGIS
- Shared packages: @gexis/api-client, @gexis/gexis-core, @gexis/ui
- Map rendering has one controlled divergence: react-map-gl (web) and @rnmapbox/maps (native), both consuming shared config from gexis-core

## Principles
- AI is a tool in the pipeline, not the product
- Deterministic: same filters + same data = same output
- Transparency: users can trace why any score is what it is
- No black-box scoring
- Free tier is genuine, not degraded
- No duplicated logic between web and native (the Astradio anti-pattern)

## Code Standards
- TypeScript everywhere (client + server)
- Python for data ingestion workers only
- OpenAPI spec maintained from day one
- All environment variables documented in .env.example

## Encoding
- All source files are UTF-8, LF line endings, no BOM
- Never use curly quotes, em dashes, or non-ASCII punctuation in source code or string literals
- If a file has encoding corruption, delete and recreate it - do not attempt in-place repair
- PowerShell terminal: when running commands that output to files, pipe through Out-File -Encoding utf8 or use [System.IO.File]::WriteAllText with UTF8 encoding

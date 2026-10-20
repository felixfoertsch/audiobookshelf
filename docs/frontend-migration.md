# Modern frontend Alpha 1

## Scope and use

Modern React client is an incomplete first alpha, not a full-parity replacement. Operator approved alpha as default only on existing experimental `podcast.felixfoertsch.de`; stable production remains unchanged. Same Express server, database, authentication, APIs and media serve both clients. Keep exactly two deployed ABS instances: stable production plus existing fork experiment. No third service, account system, database migration or media rewrite. Release identifier, publication and rollout remain primary operator responsibilities.

Build preview from repository root:

```fish
mise install
cd web
mise exec -- bun install --frozen-lockfile
mise exec -- bun run typecheck
mise exec -- bun run lint
mise exec -- bun run test
mise exec -- bun run build
mise exec -- bun run e2e
```

Start existing backend normally after building it. Open `/new/`, or `${RouterBasePath}/new/` through configured prefix. Deep links stay inside that mount. Server injects `window.__ABS_WEB_CONFIG__` with actual `basePath` (UI mount, no trailing slash) and `apiBasePath` (actual external prefix, empty for direct-root access), plus `<base>` for relative assets. Config comes from server's trusted request-prefix bookkeeping, not client query parameters. Classic client remains at native routes. Explicit fallback is `apiBasePath + '/?classic=1'`, visible even on alpha login/error pages. This loads unchanged Classic root, which selects its native library/login route; refresh and links retain existing API/auth/assets/socket paths.

Set runtime `MODERN_WEB_DEFAULT=true` only on experiment to redirect GET/HEAD root landing (`/` or configured prefix with optional trailing slash) to existing `/new/`. Flag defaults off; other values leave Classic default. Redirect is temporary (302), uncached, preserves query bytes and leaves browser fragment inheritance intact. `?classic=1` bypasses it; canonical Classic deep links remain untouched. No cookie, global preference, mount relocation or transport rewrite. `REACT_CLIENT_PATH` takes precedence and disables this landing selection. Roll back by removing flag/restarting existing experiment; `/new/` remains opt-in. `web/dist` is optional outside container builds: absent build skips landing redirect and returns 404 only for preview; backend and Classic client still start. HTML uses `Cache-Control: no-store`; hashed preview assets may cache immutably. Missing assets never receive SPA HTML. Existing `REACT_CLIENT_PATH` continues selecting optional Next.js client exactly as before; it is not modern-preview switch. Existing Nuxt base path remains unchanged.

Docker builds both clients and copies modern output into `/app/web/dist`. Bun builder pin must match root `.mise.toml` and `web/package.json` package-manager pin. CI runs `check-web` Docker target (typecheck, lint, unit tests, build and Chromium browser tests) on existing rootless `linux-builder` before runtime image build, existing FFmpeg/Chromaprint smoke, and publication. Browser OS dependencies live only in disposable builder stage. No new registry credentials or privileged containers.

## Local fixture preview

After building, run from `web`:

```fish
mise exec -- bun e2e/fixture.ts
```

Open `http://127.0.0.1:4179/new/` or `http://127.0.0.1:4179/abs/new/`. Fixture server binds loopback; login `listener` / `password` is synthetic, not a production account. `web/e2e/data.ts` and `web/e2e/media/README.md` own fixture inventory, metadata and media provenance; do not infer production coverage from these fixtures.

Two local narrated samples are served when their ignored WAV files exist under `web/e2e/media/local/`. Shipped portable fallbacks are tones, not voice. Follow media README regeneration instructions for narration; no voice redistribution rights are asserted here.

Historical thin-preview snapshot at audit start (2026-10-20): basic single-track audiobook/podcast playback, non-clickable chapters, Classic fallback for multi-track/direct-playback errors, no automatic transcoding retry and pending realtime reconciliation. Concurrent implementation supersedes this snapshot; consult ongoing source and verification evidence for current capabilities. These were implementation gaps, never accepted deferrals. Full parity remains required; no Classic fallback counts as ported functionality.

## Full parity target

[Full route and shared-surface audit](frontend-parity.md) is authoritative requirement map: all Classic information, buttons, dialogs, workflows, permission gates and states need working modern equivalents. Earlier podcast/basic-book slice and broad Classic fallback describe historical implementation limits only, not completion criteria. No fallback counts as ported functionality; no decorative or dead controls count.

Preserve Classic information architecture and canonical paths 1:1 under reversible `/new` prefix. For example, `/library/:library` pairs with `/new/library/:library`, `/item/:id` with `/new/item/:id`; personalized library home and full bookshelf remain distinct. Current plural `/new/libraries/:libraryId` and `/new/items/:itemId` are temporary paths, to become compatibility redirects when canonical routes are implemented. This document changes no routes. Local root stays Classic unless explicit alpha-default flag is enabled. Approved experimental alpha cutover accepts incomplete parity; full parity remains product target, not first-alpha claim.

Summary below describes required coverage, not accepted omissions. Exact Nuxt patterns (including optional parameters), manually mounted Express overlaps, per-route actions/states/contracts and ownership slices live in linked audit.

| Required area | Full modern coverage required |
| --- | --- |
| Entry, account and auth | Login/setup/OIDC, restore/expiry/logout, account/password/devices, sessions, users and API keys with original permissions |
| Library and entities | Personalized home versus full bookshelf, filters/search/sort, authors/series/narrators, collections/playlists and stats |
| Items and podcasts | Complete metadata/file/progress/actions, subscribe/discovery/OPML, latest episodes/download queue, episode editing and schedules |
| Global playback | Multi-track/direct/HLS, chapters/seek/rate, queue/autoplay/bookmarks/sleep, Cast, realtime/session/progress and fork analysis controls |
| Readers and tools | Actual EPUB/PDF/comic/MOBI behavior, chapters/track editing, metadata embed/M4B lifecycle, public shares |
| Ingest and operations | Upload/batch, every settings/admin screen and nested dialog, libraries/scanners, backups/email/notifications/RSS/logs/metadata providers/genres/tags |

## Verification and cutover gates

Shell correction, local-only: authenticated root owns one library Sidebar and search; catalog routes render content only. Official shadcn new-york-v4 Sidebar/Sheet and DropdownMenu replace flat shell controls, with scoped catalog query synchronization. Verification: 187 unit tests (56 files), typecheck, Biome, frozen Bun install and isolated production build pass; portable browser suite passes 43 cases (12 opt-in skips), socket-enabled cached-media suite passes 49 (six opt-in skips), and separate Classic route/semantic checks pass four cases. New shell cases cover 320/390/1036/1280 widths, keyboard/Escape/focus return, mobile navigation close, active links, permission gates, saved light/dark themes and long names. Artifacts stay outside `web/dist`; no deployment or production mutation. These checks do not certify full parity, Docker or hardware behavior.

Current isolated integration evidence: 54 unit files / 181 tests, 36 portable browser cases (ten opt-in skips), and 46 combined opt-in browser cases pass. Combined run includes Classic 41-route inventory plus three semantic slices and six cached-media cases, with all seven audiobook files tested at root and `/abs`. Backend: 410 passing, one pending; modern serving: ten passing. Four bookmark layout screenshots persist in approved temporary `cast-fix-bookmarks/`; Cast enabled/disabled bootstrap and logout pass at root and `/abs` using local SDK double, not hardware. Each Cast case also passes five clean-context repetitions in both portable and socket-enabled modes. Candidate artifact resides in approved temporary `abs-freeze-dist-v3`, not `web/dist`. No preview promotion, deployment or cutover performed. Full parity, Docker image verification, Cast hardware and native installation UI remain unverified; see `frontend-parity.md` verification limits.

Alpha 1 selection verification: real Node 24.21.0 passes 181 frontend unit tests (54 files), typecheck, Biome and isolated production build; backend 413 passing / one pending, including 13 serving tests. Combined cached-media browser suite passes 46 cases (two native-Classic opt-in skips), preserving all seven book tracks at root and `/abs`. Separate native Classic builds pass two fallback browser cases (root and `/abs`); same production-default `/audiobookshelf` artifact also passes direct-root alpha escape, native login/library/item navigation, refresh, API/assets/socket and media requests. Query and fragment survive landing redirect. Docker-like source copy excluding ignored narration/real media passes Node units/build and 36 portable browser cases (12 opt-in skips). Actual Docker consumer remains CI gate: local Docker/Podman unavailable; no claim of image execution.

Native fallback browser gate uses `CLASSIC_COMPARE=1 CLASSIC_NATIVE_DIST_PATH=/absolute/artifacts FIXTURE_DIST_PATH=/absolute/alpha-dist` with `playwright test e2e/alpha-landing.spec.ts`. Artifacts directory holds `root/` and `abs/` built with matching Nuxt base; `CLASSIC_PRODUCTION_BASE=1` instead uses `production/` built with unchanged Docker default `/audiobookshelf`. Generate outside `client/dist` using temporary Nuxt config overriding only `buildDir` and `generate.dir`; never replace user preview. Fixture opt-in is synthetic only, not production mount implementation.

- Run backend Mocha `test/server/modernWeb.test.js` after compilation. It exercises Express HTTP handlers with real temporary HTML/assets: root/prefixed deep links, config/base injection, classic/backend preservation, missing assets/builds, immutable assets and rejected script-bearing prefixes.
- Run frontend typecheck, lint, unit tests, production build and browser suite. Fixture sources and media-provenance documentation under `web/e2e/` own the dummy podcast/audiobook inventory, metadata, original narration text and local audio-generation details; consult those sources rather than assuming fixed counts. Acceptance requires multiple dummy podcasts and audiobooks with metadata and at least one working audiobook file and one working podcast file for playback testing. Fixtures do not prove live authentication, backend permissions, production media compatibility or full podcast/audiobook parity.
- Locally first, verify real local/external login, session expiry/logout, root and configured-prefix navigation, direct audio and HLS, progress/queue/bookmarks, candidate marks/skips, errors and rollback escape hatch. Verify any existing experiment deployment only with separate approval; stable remains untouched. Do not modify media or analysis consent to test UI.
- Experimental alpha default is separately approved despite incomplete parity. Before rollout, verify API/media non-interception, cache/service-worker behavior and explicit Classic escape hatch. Stable/full-parity cutover remains unapproved and still requires every route/shared surface in `frontend-parity.md`, accessible keyboard/mobile flows and separate operator approval.

Fallback: open `/?classic=1` (or `${RouterBasePath}/?classic=1`); disable `MODERN_WEB_DEFAULT` to restore Classic default. Remove or omit `web/dist` to disable alpha without changing backend data. Deployment rollback follows existing image/operator process, not automatic deployment from frontend build or image publication.

# Issue #2 closeout evidence

Modern only. Safari/iOS and physical Cast hardware belong to #8, not this gate. Initial audit baseline: `523524044df03c52f52bdf5fc9a40c478c68c7c3`, CI 1482. Status below records initial audit, before closeout changes.

| Item | Initial status | Evidence / remaining check |
| --- | --- | --- |
| 1. Every Modern route/action | gap | `docs/frontend-parity.md` maps routes but explicitly records missing action assertions; exhaustive control-to-named-test audit required. |
| 2. Apple theme, accessibility, every offered view | met | `web/e2e/{theme,apple-theme,shell,control-contrast,sidebar-contrast,catalog-views}.spec.ts`; CI 1482 browser 183 passed, 12 skipped. Re-run after closeout. |
| 3. Serializer fixtures and lifecycle unit tests | gap | `api.test.ts`: concurrent refresh; `features/player/timeline.test.ts`: global seeks; `features/player/skipping.test.ts`: boundaries/replay/touch-only; `player.test.tsx`: stale candidates. Verify exact stale/inconclusive integration and fixture provenance. |
| 4. Browser workflows at root and `/abs` | met | `web/e2e/{preview,lifecycle,shell-permissions,back-scroll,podcast-events,reconnect,parity-contracts}.spec.ts`; re-run full suite. |
| 5. Chromium playback | gap | `web/e2e/playback-contract.spec.ts`: MediaSession, HLS, failed sync and queue; `real-playback.spec.ts`: book global seek/session. Verify synthetic audiobook progress/route continuity, not only podcast. Safari/hardware deferred #8. |
| 6. Analysis contract, markers, opt-in | gap | `player.test.tsx`, `features/player/skipping.test.ts`, `e2e/stale.spec.ts`. New 1 px timeline geometry matrix required; screenshot claim unproven. |
| 7. Toolchain and gates | gap | Actual frontend Bun 1.4.3 pinned in `.mise.toml` and `web/package.json`; Vite/React/TanStack/Biome/Vitest/Playwright. No migration needed. Full checks and new CI required. PWA cache audit pending. |
| 8. Experiment rollout/rollback | met | `.dotfiles/infrastructure/ffunraid/services/audiobookshelf-experiment/README.md`, latest section records CI 1482, immutable digest, stopped corpus backup, stable/Gluetun baseline, recovery and rollback. New deployment still required. |
| 9. Synthetic books and podcasts | gap | Existing `web/e2e/data.ts`, `real-playback.spec.ts`, `preview.spec.ts`; verify both types satisfy all requested playback/progress assertions. |

## Named lifecycle and failure evidence

- Serializer provenance: `test/server/frontendFixtures.test.js` — `matches real expanded models, playback session and emitted analysis payload` regenerates via production models/session/emitter and rejects drift. `web/src/test/serializer-fixtures.test.ts` — `accepts nullable, absent and empty metadata (%j)`, `rejects malformed item, session and socket payloads`, `surfaces API HTTP and malformed success failures, then accepts recovered serializer response`. `serializer-socket.test.tsx` — `ignores malformed and unrelated socket events, applies emitted serializer fixture`.
- Refresh: `web/src/api.test.ts` — `serializes concurrent refresh and retries authorized API calls`, `does not restore authentication from refresh completing after logout`.
- Global time/track seeks: `features/player/timeline.test.ts` — `maps seeks across boundaries and end`, `derives absent offsets from track lengths`; `multitrack.test.tsx` — `changes actual audio source, maps global seeks, advances tracks, syncs original time`.
- Touch-only auto-skip: `features/player/skipping.test.ts` — `skips when continuous playback crosses a marker`, `does not skip a seek into a segment but reaches later markers`, `skips again after seeking back before a marker`, `never rewinds when a coarse update already passed the end`; `player-lifetime.test.tsx` — `mounted player skips crossings again after seek-back and tracks fresh sessions`. Seek destinations deliberately do not skip. Crossing start again after seek-back does skip.
- Stale/inconclusive: `player.test.tsx` — `stale and inconclusive session evidence never skips a crossed marker` composes fresh session filtering with `skipTarget`; `ignores stale page candidates when fresh session stale or empty`; `web/e2e/stale.spec.ts` — `cached page candidates never override fresh stale session`.
- Queue: `features/player/queue.test.ts` — `keeps queue ordering and removes only selected entry`, `starts first queue item using native playback request and queues remainder`; `player.test.tsx` — `removes captured queue entry after deferred playback without losing reordered entry`.
- Progress unit lifecycle: `features/item/progress.test.ts` — `uses exact item and episode identity, never show-level progress`, `accepts own user and playback socket contracts, rejects another owner`, `does not overwrite newer socket progress with stale HTTP`, `rejects old-owner socket and HTTP after account changes`.
- Progress lifecycle: `web/e2e/lifecycle.spec.ts` — `failed metadata preserves resume when closing`, `ended session removed then replay creates fresh session`, `failed replacement removes closed controls and retry syncs fresh session`; `playback-contract.spec.ts` — `failed progress sync surfaces, retries successfully, finish advances queue`.

## Screenshot correction

`/private/tmp/opencode/integrate-ui/item-segment-light.png` shows elapsed 00:00:06, duration about 12.35 s, and default fixture segment 2.1–3.8 s (`web/e2e/data.ts`). Playhead therefore lies outside segment. Prior rollout phrase “paused inside segment” is incorrect; screenshot cannot establish marker geometry. Pixel geometry tests, not that claim, establish alignment: `web/e2e/timeline-geometry.spec.ts` — `local compact and expanded timeline pixel geometry root` / `/abs` and `Cast compact and expanded timeline pixel geometry root` / `/abs` assert both segment edges within 1 px at 390/1280 CSS pixels, before and after opening Player options. Local and mocked Cast timelines pass all 16 state/width/mount combinations; Cast options' separate Original timeline also passes at both widths and mounts. Opening local options retains the shared timeline rather than rendering a second local slider; measurements explicitly include that expanded state. Original local marker alignment passes; applying an 8 px inset produces a 2.81 px failure and was rejected. Cast options now use existing stock shadcn Slider instead of native range, aligning markers to explicit track rect rather than browser-dependent native thumb inset. Both elapsed time and candidate bounds use original session/global timeline.

## Synthetic media evidence

`web/e2e/data.ts` defines six original shows and six original books, synthetic SVG covers, chapters, user progress and varied episode analysis/download states. `web/e2e/media/README.md` documents original transcripts and local native narration generation; checked-in deterministic PCM tones provide CI-safe audible fallback for one podcast and one audiobook. No copyrighted download or production library data required. Both fallback durations match metadata and are checked by `web/src/fixture.test.ts`. Optional private/full-length external media tests are separate, skipped unless prepared.

## Named browser workflow evidence

- Restore/login/logout: `web/e2e/preview.spec.ts` — `browse and original audio lifecycle root` / `/abs`; `lifecycle.spec.ts` — `local logout closes playback before revocation and stays signed out root` / `/abs` exercises fresh context restoration and revocation. `web/src/api.test.ts` covers cookie-only restore and auth failures.
- Ordinary/admin: `shell-permissions.spec.ts` — `shell preserves listener permissions`, `shell preserves admin permissions`, `podcast download queue enforces backend permissions root` / `/abs`.
- Library/search/detail/back: `preview.spec.ts` — browse lifecycle; `back-scroll.spec.ts` — `bookshelf Back restores query and scroll root` / `/abs`; `catalog-views.spec.ts` — book/podcast grid/list/detailed, narrow/desktop, root/prefix and entity isolation.
- Episode controls: `audit-remediation.spec.ts` — `audit compact safe episodes: ...` checks varied states, safe description disclosure and accessible control sheets; `podcast-ux.spec.ts` checks unsaved settings drafts and date display.
- Download/event/reconnect: `podcast-events.spec.ts` — `download socket lifecycle root` / `/abs`; `reconnect.spec.ts` — `real socket reconnect revalidates once root` / `/abs`.
- Deep reload: `preview.spec.ts` — browse lifecycle reloads detail; `catalog-views.spec.ts` reloads every offered view at both mounts. Actual backend root/prefix routing and missing-asset behavior are checked by backend suite and Docker `check-backend`.
- Theme/accessibility: `theme.spec.ts` — `system theme ...` follows OS changes and persists manual preference, `theme text colors meet WCAG AA contrast in light and dark modes ...`; `shell.spec.ts` — `single shell ownership, menu keyboard and sidebar ...`, `200% reflow and rendered glass contrast ...`; `apple-theme.spec.ts`, `control-contrast.spec.ts`, `sidebar-contrast.spec.ts` verify Apple material and composited contrast after theme change.
- Chromium media: `playback-contract.spec.ts` — `MediaSession actions drive real playback and next queued item`, `forced HLS decodes media and advances currentTime`, `failed progress sync surfaces, retries successfully, finish advances queue`; `compact-player.spec.ts` checks transport, volume/rate and persistent audio across options/navigation. Optional private full-length `real-playback.spec.ts` cases are not required synthetic gate evidence.

## Toolchain and cache boundary

Frontend is Bun-managed, not Bun-only: Bun 1.4.3 installs dependencies and orchestrates scripts; Vitest/jsdom require real Node. Docker already supplies Node 24. Local `.mise.toml` now pins Node 24.21.0 as well as Bun because `mise exec` otherwise omits unmanaged Node and Bun falls back to incompatible jsdom execution. No stack migration or dependency added.

Theme re-verification: `theme.spec.ts`, `apple-theme.spec.ts`, `control-contrast.spec.ts`, `sidebar-contrast.spec.ts` and `installability.spec.ts` passed 19 tests. System light/dark and manual persistence pass at both mounts; Apple materials and rendered control/sidebar contrast pass. Full suite also includes keyboard/focus, narrow/desktop and 200% reflow checks.

Home-screen manifest/icons exist, but no service worker, Workbox or offline cache. `web/e2e/installability.spec.ts` — `native home-screen metadata scoped to root preview` and `/abs preview` assert zero service-worker registrations and empty Cache Storage. No authenticated API/audio caching introduced. Safari installation/update UX remains #8.

## Closeout verification

Local full Playwright run including expanded timeline states: **192 passed, 12 expected skips**, 5.8 minutes, root and `/abs`. Skips cover optional Classic/private-media cases, not required Modern workflows. Frontend unit suite: **74 files, 308 tests passed**. Frontend typecheck, lint and production build passed. Node 24.21.0 backend suite: **446 passed, 2 pending**; build contract and `git diff --check` passed. Detector blob remains `7287bad5cde8dd22715a98fef8483f629c6b8e70`.

Exhaustive Modern action audit, final integration, new CI and experiment deployment remain pending. Initial statuses above are not final acceptance claims.

# Native semantics

Stock ABS 2.37.1 remains catalog, auth, download, playback, session and progress authority. Sidecar failure never substitutes synthetic ids into native APIs.

| Inventory S row | Standalone decision |
|---|---|
| catalog.getItem, item service expanded detail, podcast item reload | Join `/psb/api/items/:itemId/analysis`; absent/disabled analysis is not enabled consent. Native episodes/count remain unchanged. |
| personalized shelves | Home `newest-episodes` uses sidecar `recent-episodes?includeFeed=1&limit=12`. Other shelves stay native. On sidecar failure native shelf retains upstream `addedAt` order and heading says `Recently added downloads`. Never sort one native page by publication and claim completeness. |
| Latest episodes | Sidecar `recent-episodes?includeFeed=1&limit=50&page=0` owns publication recency, pagination and feed-only rows. Native endpoint cannot implement feed augmentation or publication recency. |
| episode counts | Sidecar episode-summary owns feed totals. Native fallback says downloaded episodes, not total feed episodes. No serializer override. |
| analysis POST, consent, corpus | Sidecar-only `/psb/api/podcasts/...`; no stock mutation of fork fields. |
| player session nested item | Fetch sidecar analysis independently; native session JSON is not assumed to contain analysis. No custom `episode_ad_analysis` socket event. |
| playlist list/detail/create/update/item routes | Native upstream endpoints. Inventory S annotations concern optional nested item analysis/availability, not a custom route or publication ordering. Preserve stock response and native permissions; inaccessible/missing nested items are unavailable, never synthesized playable. |
| debug routes | Sidecar-only bearer transport; native `/api/debug` absent. |

Complete downloaded show detail may sort its loaded episodes by `publishedAt`; this is not library-wide publication pagination. Feed-only episode download resolves a real downloaded native episode before playback/progress.

# Verification limits

Local checks: 435 unit tests passed across 100 files; typecheck, Biome and production build passed. Playwright discovery lists 205 tests across 55 files; discovery is not execution. Proxy entrypoint URL self-check passed.

Container fixtures remain incomplete: sidecar mock lacks full debug dashboard, feed-only lifecycle and corpus state. These are acceptance blockers, not passing coverage. Existing specs retained but cannot be certified until built-container run exposes and repairs fixture mismatches.

Container runtime unavailable in local runner. Built-container proxy acceptance and authenticated stable smoke remain blocked, not passed. No stable credentials read, no stable login/session created during blocked smoke. Frontend source build alone does not certify proxy behavior.

# Contract reconciliation

Sidecar `contract/api.ts` originally advertised item-scoped consent/enqueue and global corpus paths while `src/app.ts` implemented podcast-scoped routes. Runtime paths, not proposed documentation, govern outgoing requests. Sidecar store emits `applicable`; contract originally omitted it. Hash presence alone is not source applicability. Current player disables automatic skip and markers entirely; source identity cannot be proved from native playback payload. Restore only after contract defines verifiable applicability, consent and finite in-duration ordered segments. Debug uses runtime mount `/psb/api/debug`, probed through `/auth` before showing switch. Episode tooltip fetches episode-scoped corpus inventory; `totalBytes` describes whole corpus, not episode bytes. Podcast-wide inventory does not exist.

Stable smoke script: `STABLE_SMOKE_ORIGIN=http://127.0.0.1:8080 bun e2e/stable-smoke.ts`, only after built proxy is running with default stable upstream. Script keeps restricted credentials and browser state in memory, never writes traces/HAR/storage state, never reads administrator credentials. No attempt performed without container runtime.

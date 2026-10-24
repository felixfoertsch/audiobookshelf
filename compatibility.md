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

Container runtime unavailable in local runner. Built-container proxy acceptance and authenticated stable smoke remain blocked, not passed. No stable credentials read, no stable login/session created during blocked smoke. Frontend source build alone does not certify proxy behavior.

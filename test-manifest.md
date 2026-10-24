# Test extraction manifest

Original baseline: `bcfd59cc49e8195b989d3ffda7c032f0fe34a5ea`. File-level disposition; runnable totals belong to verification report, not inferred from file counts.

| Old spec | Disposition | Reason / location |
|---|---|---|
| `test/server/Logger.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/auth/OidcAuthStrategy.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/auth/TokenManager.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/controllers/LibraryController.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/controllers/LibraryItemController.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/controllers/LibraryRecentEpisodes.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/controllers/PodcastAdAnalysis.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/controllers/PodcastEpisodeSummary.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/controllers/UserController.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/debugHost.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/debugJwt.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/debugOverlay.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/debugShutdown.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/finders/BookFinder.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/frontendFixtures.test.js` | adapted | Frontend schema fixtures retained in src/test; native serializer implementation stays upstream. |
| `test/server/managers/ApiCacheManager.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/managers/BinaryManager.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/managers/MigrationManager.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v0.0.1-migration_example.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.15.0-series-column-unique.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.17.3-fk-constraints.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.17.4-use-subfolder-for-oidc-redirect-uris.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.17.5-remove-host-from-feed-urls.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.17.6-share-add-isdownloadable.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.19.1-copy-title-to-library-items.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.19.4-improve-podcast-queries.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/migrations/v2.20.0-improve-author-sort-queries.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/models/oldJsonSerialization.test.js` | adapted | Frontend schema fixtures retained in src/test; native serializer implementation stays upstream. |
| `test/server/modernWeb.test.js` | adapted | Express serving removed; proxy invariants covered by e2e proxy contracts. |
| `test/server/objects/TrackProgressMonitor.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/providers/Audible.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/PodcastRecency.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/adAnalysisDiagnostics.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/adAnalysisProxy.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/adAnalysisPublicResult.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/adCatalogMatching.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/adComparisonCorpus.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/adComparisonPublication.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/daiAnalysis.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/daiNativeSafety.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/ffmpegHelpers.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/fileUtils.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/mpegFrameAlignment.test.js` | dropped from frontend | Sidecar-owned behavior; extraction verification belongs to podcast-sponsorblock, not frontend test total. |
| `test/server/utils/parsers/parseNameString.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/parsers/parseNfoMetadata.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/parsers/parseOpfMetadata.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/requestUtils.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/scandir.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `test/server/utils/stringifySequeslizeQuery.test.js` | dropped | Unmodified ABS backend/Classic behavior remains upstream responsibility; historical spec retained in Git. |
| `web/e2e/ad-analysis.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/ad-analysis.spec.ts`; root transport adapted where affected. |
| `web/e2e/admin-active.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/admin-active.spec.ts`; root transport adapted where affected. |
| `web/e2e/alpha-landing.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/alpha-landing.spec.ts`; root transport adapted where affected. |
| `web/e2e/apple-detail.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/apple-detail.spec.ts`; root transport adapted where affected. |
| `web/e2e/apple-material.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/apple-material.spec.ts`; root transport adapted where affected. |
| `web/e2e/apple-shell.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/apple-shell.spec.ts`; root transport adapted where affected. |
| `web/e2e/apple-theme.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/apple-theme.spec.ts`; root transport adapted where affected. |
| `web/e2e/audiobook-player.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/audiobook-player.spec.ts`; root transport adapted where affected. |
| `web/e2e/audit-remediation.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/audit-remediation.spec.ts`; root transport adapted where affected. |
| `web/e2e/audit-tools-layout.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/audit-tools-layout.spec.ts`; root transport adapted where affected. |
| `web/e2e/back-scroll.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/back-scroll.spec.ts`; root transport adapted where affected. |
| `web/e2e/book-contrast.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/book-contrast.spec.ts`; root transport adapted where affected. |
| `web/e2e/book-detail.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/book-detail.spec.ts`; root transport adapted where affected. |
| `web/e2e/book-manage.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/book-manage.spec.ts`; root transport adapted where affected. |
| `web/e2e/book-tools.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/book-tools.spec.ts`; root transport adapted where affected. |
| `web/e2e/bookmark-layout.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/bookmark-layout.spec.ts`; root transport adapted where affected. |
| `web/e2e/cast-bootstrap.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/cast-bootstrap.spec.ts`; root transport adapted where affected. |
| `web/e2e/catalog-layout.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/catalog-layout.spec.ts`; root transport adapted where affected. |
| `web/e2e/catalog-views.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/catalog-views.spec.ts`; root transport adapted where affected. |
| `web/e2e/classic-preview/session-track.test.ts` | kept/adapted | Frontend behavior retained at `e2e/classic-preview/session-track.test.ts`; root transport adapted where affected. |
| `web/e2e/compact-player.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/compact-player.spec.ts`; root transport adapted where affected. |
| `web/e2e/control-contrast.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/control-contrast.spec.ts`; root transport adapted where affected. |
| `web/e2e/debug.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/debug.spec.ts`; root transport adapted where affected. |
| `web/e2e/feed-episodes.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/feed-episodes.spec.ts`; root transport adapted where affected. |
| `web/e2e/home-shell.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/home-shell.spec.ts`; root transport adapted where affected. |
| `web/e2e/installability.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/installability.spec.ts`; root transport adapted where affected. |
| `web/e2e/integrated-layout.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/integrated-layout.spec.ts`; root transport adapted where affected. |
| `web/e2e/integration-capture.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/integration-capture.spec.ts`; root transport adapted where affected. |
| `web/e2e/lifecycle.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/lifecycle.spec.ts`; root transport adapted where affected. |
| `web/e2e/opml.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/opml.spec.ts`; root transport adapted where affected. |
| `web/e2e/parity-contracts.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/parity-contracts.spec.ts`; root transport adapted where affected. |
| `web/e2e/playback-contract.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/playback-contract.spec.ts`; root transport adapted where affected. |
| `web/e2e/playlist-create.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/playlist-create.spec.ts`; root transport adapted where affected. |
| `web/e2e/playlists.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/playlists.spec.ts`; root transport adapted where affected. |
| `web/e2e/podcast-events.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/podcast-events.spec.ts`; root transport adapted where affected. |
| `web/e2e/podcast-search-modal.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/podcast-search-modal.spec.ts`; root transport adapted where affected. |
| `web/e2e/podcast-ux.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/podcast-ux.spec.ts`; root transport adapted where affected. |
| `web/e2e/preview.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/preview.spec.ts`; root transport adapted where affected. |
| `web/e2e/progress-ux.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/progress-ux.spec.ts`; root transport adapted where affected. |
| `web/e2e/reader.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/reader.spec.ts`; root transport adapted where affected. |
| `web/e2e/real-playback.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/real-playback.spec.ts`; root transport adapted where affected. |
| `web/e2e/reconnect.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/reconnect.spec.ts`; root transport adapted where affected. |
| `web/e2e/redirects.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/redirects.spec.ts`; root transport adapted where affected. |
| `web/e2e/review-regressions.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/review-regressions.spec.ts`; root transport adapted where affected. |
| `web/e2e/select-latest.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/select-latest.spec.ts`; root transport adapted where affected. |
| `web/e2e/selection-geometry.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/selection-geometry.spec.ts`; root transport adapted where affected. |
| `web/e2e/shelf-bleed.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/shelf-bleed.spec.ts`; root transport adapted where affected. |
| `web/e2e/shell-config.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/shell-config.spec.ts`; root transport adapted where affected. |
| `web/e2e/shell-permissions.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/shell-permissions.spec.ts`; root transport adapted where affected. |
| `web/e2e/shell.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/shell.spec.ts`; root transport adapted where affected. |
| `web/e2e/sidebar-contrast.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/sidebar-contrast.spec.ts`; root transport adapted where affected. |
| `web/e2e/sidebar-height.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/sidebar-height.spec.ts`; root transport adapted where affected. |
| `web/e2e/stale.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/stale.spec.ts`; root transport adapted where affected. |
| `web/e2e/theme.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/theme.spec.ts`; root transport adapted where affected. |
| `web/e2e/timeline-geometry.spec.ts` | kept/adapted | Frontend behavior retained at `e2e/timeline-geometry.spec.ts`; root transport adapted where affected. |
| `web/src/api.test.ts` | kept/adapted | Frontend behavior retained at `src/api.test.ts`; root transport adapted where affected. |
| `web/src/catalog.test.tsx` | kept/adapted | Frontend behavior retained at `src/catalog.test.tsx`; root transport adapted where affected. |
| `web/src/features/account/index.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/account/index.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/actions.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/actions.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/api-keys.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/api-keys.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/authentication.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/authentication.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/backup-replacement.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/backup-replacement.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/backups.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/backups.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/email.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/email.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/libraries.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/libraries.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/logs.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/logs.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/metadata.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/metadata.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/notifications.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/notifications.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/rss-feeds.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/rss-feeds.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/session-details.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/session-details.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/sessions.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/sessions.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/settings.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/settings.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/stats.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/stats.test.tsx`; root transport adapted where affected. |
| `web/src/features/admin/users.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/admin/users.test.tsx`; root transport adapted where affected. |
| `web/src/features/auth/login.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/auth/login.test.tsx`; root transport adapted where affected. |
| `web/src/features/auth/navigation.test.ts` | kept/adapted | Frontend behavior retained at `src/features/auth/navigation.test.ts`; root transport adapted where affected. |
| `web/src/features/auth/oidc.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/auth/oidc.test.tsx`; root transport adapted where affected. |
| `web/src/features/batch/index.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/batch/index.test.tsx`; root transport adapted where affected. |
| `web/src/features/batch/model.test.ts` | kept/adapted | Frontend behavior retained at `src/features/batch/model.test.ts`; root transport adapted where affected. |
| `web/src/features/catalog/author-regression.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/author-regression.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/browse.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/browse.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/catalog-polish.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/catalog-polish.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/catalog-ux.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/catalog-ux.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/continue-card.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/continue-card.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/entities.test.ts` | kept/adapted | Frontend behavior retained at `src/features/catalog/entities.test.ts`; root transport adapted where affected. |
| `web/src/features/catalog/entity-actions.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/entity-actions.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/narrators.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/narrators.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/playlist-availability.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/playlist-availability.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/playlist-list.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/playlist-list.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/public-layout.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/public-layout.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/retention.test.ts` | kept/adapted | Frontend behavior retained at `src/features/catalog/retention.test.ts`; root transport adapted where affected. |
| `web/src/features/catalog/search-owner.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/search-owner.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/selection-toolbar.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/selection-toolbar.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/series-actions.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/series-actions.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/server-activity.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/server-activity.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/shelf-carousel.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/shelf-carousel.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/shelf-identity.test.ts` | kept/adapted | Frontend behavior retained at `src/features/catalog/shelf-identity.test.ts`; root transport adapted where affected. |
| `web/src/features/catalog/shelf-progress.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/shelf-progress.test.tsx`; root transport adapted where affected. |
| `web/src/features/catalog/shell.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/catalog/shell.test.tsx`; root transport adapted where affected. |
| `web/src/features/debug-path.test.ts` | kept/adapted | Frontend behavior retained at `src/features/debug-path.test.ts`; root transport adapted where affected. |
| `web/src/features/debug.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/debug.test.tsx`; root transport adapted where affected. |
| `web/src/features/i18n/index.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/i18n/index.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/BookFiles.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/BookFiles.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/BookManage.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/BookManage.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/BookMatch.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/BookMatch.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/BookMembership.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/BookMembership.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/BookTools.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/BookTools.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/EpisodeEdit.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/EpisodeEdit.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/ItemActions.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/ItemActions.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/ItemView.presentation.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/ItemView.presentation.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/ItemView.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/item/ItemView.test.tsx`; root transport adapted where affected. |
| `web/src/features/item/book-manage.test.ts` | kept/adapted | Frontend behavior retained at `src/features/item/book-manage.test.ts`; root transport adapted where affected. |
| `web/src/features/item/item-actions.test.ts` | kept/adapted | Frontend behavior retained at `src/features/item/item-actions.test.ts`; root transport adapted where affected. |
| `web/src/features/item/progress.test.ts` | kept/adapted | Frontend behavior retained at `src/features/item/progress.test.ts`; root transport adapted where affected. |
| `web/src/features/item/schemas.test.ts` | kept/adapted | Frontend behavior retained at `src/features/item/schemas.test.ts`; root transport adapted where affected. |
| `web/src/features/item/service.test.ts` | kept/adapted | Frontend behavior retained at `src/features/item/service.test.ts`; root transport adapted where affected. |
| `web/src/features/player/cast-control.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/player/cast-control.test.tsx`; root transport adapted where affected. |
| `web/src/features/player/cast-player.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/player/cast-player.test.tsx`; root transport adapted where affected. |
| `web/src/features/player/cast-transfer.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/player/cast-transfer.test.tsx`; root transport adapted where affected. |
| `web/src/features/player/cast.test.ts` | kept/adapted | Frontend behavior retained at `src/features/player/cast.test.ts`; root transport adapted where affected. |
| `web/src/features/player/compact-player.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/player/compact-player.test.tsx`; root transport adapted where affected. |
| `web/src/features/player/multitrack.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/player/multitrack.test.tsx`; root transport adapted where affected. |
| `web/src/features/player/queue.test.ts` | kept/adapted | Frontend behavior retained at `src/features/player/queue.test.ts`; root transport adapted where affected. |
| `web/src/features/player/settings.test.ts` | kept/adapted | Frontend behavior retained at `src/features/player/settings.test.ts`; root transport adapted where affected. |
| `web/src/features/player/skipping.test.ts` | kept/adapted | Frontend behavior retained at `src/features/player/skipping.test.ts`; root transport adapted where affected. |
| `web/src/features/player/timeline.test.ts` | kept/adapted | Frontend behavior retained at `src/features/player/timeline.test.ts`; root transport adapted where affected. |
| `web/src/features/podcast/AdAnalysisStatus.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/AdAnalysisStatus.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/EpisodeRow.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/EpisodeRow.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/PodcastEpisodeCount.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/PodcastEpisodeCount.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/PodcastSearchModal.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/PodcastSearchModal.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/PodcastSearchResults.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/PodcastSearchResults.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/feed-episodes.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/feed-episodes.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/index.test.ts` | kept/adapted | Frontend behavior retained at `src/features/podcast/index.test.ts`; root transport adapted where affected. |
| `web/src/features/podcast/opml.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/opml.test.tsx`; root transport adapted where affected. |
| `web/src/features/podcast/podcast-ux.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/podcast/podcast-ux.test.tsx`; root transport adapted where affected. |
| `web/src/features/reader/comic.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/reader/comic.test.tsx`; root transport adapted where affected. |
| `web/src/features/reader/engines.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/reader/engines.test.tsx`; root transport adapted where affected. |
| `web/src/features/reader/lifecycle.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/reader/lifecycle.test.tsx`; root transport adapted where affected. |
| `web/src/features/reader/reader.test.ts` | kept/adapted | Frontend behavior retained at `src/features/reader/reader.test.ts`; root transport adapted where affected. |
| `web/src/features/reader/settings.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/reader/settings.test.tsx`; root transport adapted where affected. |
| `web/src/features/share/share.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/share/share.test.tsx`; root transport adapted where affected. |
| `web/src/features/upload/index.test.tsx` | kept/adapted | Frontend behavior retained at `src/features/upload/index.test.tsx`; root transport adapted where affected. |
| `web/src/features/upload/model.test.ts` | kept/adapted | Frontend behavior retained at `src/features/upload/model.test.ts`; root transport adapted where affected. |
| `web/src/fixture.test.ts` | kept/adapted | Frontend behavior retained at `src/fixture.test.ts`; root transport adapted where affected. |
| `web/src/player-lifetime.test.tsx` | kept/adapted | Frontend behavior retained at `src/player-lifetime.test.tsx`; root transport adapted where affected. |
| `web/src/player.test.tsx` | kept/adapted | Frontend behavior retained at `src/player.test.tsx`; root transport adapted where affected. |
| `web/src/routes/-index.test.ts` | kept/adapted | Frontend behavior retained at `src/routes/-index.test.ts`; root transport adapted where affected. |
| `web/src/shared/components/IsoDateTimeField.test.tsx` | kept/adapted | Frontend behavior retained at `src/shared/components/IsoDateTimeField.test.tsx`; root transport adapted where affected. |
| `web/src/shared/components/RichText.test.tsx` | kept/adapted | Frontend behavior retained at `src/shared/components/RichText.test.tsx`; root transport adapted where affected. |
| `web/src/shared/date-time.test.ts` | kept/adapted | Frontend behavior retained at `src/shared/date-time.test.ts`; root transport adapted where affected. |
| `web/src/shared/lib/duration.test.ts` | kept/adapted | Frontend behavior retained at `src/shared/lib/duration.test.ts`; root transport adapted where affected. |
| `web/src/shared/settings-nav.test.tsx` | kept/adapted | Frontend behavior retained at `src/shared/settings-nav.test.tsx`; root transport adapted where affected. |
| `web/src/test/serializer-fixtures.test.ts` | kept/adapted | Frontend behavior retained at `src/test/serializer-fixtures.test.ts`; root transport adapted where affected. |
| `web/src/test/serializer-socket.test.tsx` | kept/adapted | Frontend behavior retained at `src/test/serializer-socket.test.tsx`; root transport adapted where affected. |

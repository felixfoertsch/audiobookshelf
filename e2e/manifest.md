# E2E manifest

Baseline commit: `877e845cf5ea4628b9a8cd21fafb82eb292108e5`

Baseline Playwright manifest: **54 specs**. All retained by filename. Adaptations reflect standalone root deployment, stock ABS payloads, and sidecar-owned analysis. `debug.spec.ts` now verifies unavailable debug routes; debug-overlay/express remains in ABS fixture import graph only if code still references it (removed).

```text
/e2e/ad-analysis.spec.ts
/e2e/admin-active.spec.ts
/e2e/alpha-landing.spec.ts
/e2e/apple-detail.spec.ts
/e2e/apple-material.spec.ts
/e2e/apple-shell.spec.ts
/e2e/apple-theme.spec.ts
/e2e/audiobook-player.spec.ts
/e2e/audit-remediation.spec.ts
/e2e/audit-tools-layout.spec.ts
/e2e/back-scroll.spec.ts
/e2e/book-contrast.spec.ts
/e2e/book-detail.spec.ts
/e2e/book-manage.spec.ts
/e2e/book-tools.spec.ts
/e2e/bookmark-layout.spec.ts
/e2e/cast-bootstrap.spec.ts
/e2e/catalog-layout.spec.ts
/e2e/catalog-views.spec.ts
/e2e/compact-player.spec.ts
/e2e/control-contrast.spec.ts
/e2e/debug.spec.ts
/e2e/feed-episodes.spec.ts
/e2e/home-shell.spec.ts
/e2e/installability.spec.ts
/e2e/integrated-layout.spec.ts
/e2e/integration-capture.spec.ts
/e2e/lifecycle.spec.ts
/e2e/opml.spec.ts
/e2e/parity-contracts.spec.ts
/e2e/playback-contract.spec.ts
/e2e/playlist-create.spec.ts
/e2e/playlists.spec.ts
/e2e/podcast-events.spec.ts
/e2e/podcast-search-modal.spec.ts
/e2e/podcast-ux.spec.ts
/e2e/preview.spec.ts
/e2e/progress-ux.spec.ts
/e2e/reader.spec.ts
/e2e/real-playback.spec.ts
/e2e/reconnect.spec.ts
/e2e/redirects.spec.ts
/e2e/review-regressions.spec.ts
/e2e/select-latest.spec.ts
/e2e/selection-geometry.spec.ts
/e2e/shelf-bleed.spec.ts
/e2e/shell-config.spec.ts
/e2e/shell-permissions.spec.ts
/e2e/shell.spec.ts
/e2e/sidebar-contrast.spec.ts
/e2e/sidebar-height.spec.ts
/e2e/stale.spec.ts
/e2e/theme.spec.ts
/e2e/timeline-geometry.spec.ts
```

## Adaptation notes

- `alpha-landing.spec.ts`: replaced Classic/Alpha banner assertions with standalone root login check.
- `debug.spec.ts`: verifies debug API remains unavailable; debug middleware removed from stock ABS fixture and standalone image scope.
- `ad-analysis.spec.ts`: uses `/psb/api/items/:id/analysis` contract and enqueue route; no ABS analysis fields or fake socket event.
- `shelf-bleed.spec.ts`: protects left content inset, tests hit testing outside inset, preserves right-edge checks; recent episode matcher uses `/psb/api/...`.
- `proxy-contract.spec.ts`: validates contract-shaped `{ episodes: record }` response, auth, ACL and proxy prefix.
- Remaining specs: root `/` SPA and root deep links; native ABS APIs stay under their stock routes. Any per-test request overrides remain local to that spec.

Playwright discovery: 205 tests across 55 files. Container-backed run: not executed. No Docker, Podman, nerdctl or Buildah found; no image digest available. Sidecar mock still lacks full debug dashboard, feed-only download lifecycle and corpus state. Retained specs are not certified passing; built-container acceptance remains incomplete.

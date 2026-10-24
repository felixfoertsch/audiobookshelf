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

## Dropped obsolete assertions

- `preview.spec.ts` sign-in helper: removed Alpha banner and Open Classic link assertions; standalone has no Classic frontend. All browsing/playback/layout tests retained.
- `shell.spec.ts`: removed Open Classic visibility, viewport and click checks; remaining shell accessibility/navigation checks retained.
- `shell-permissions.spec.ts`: removed Open Classic link check; native permission checks retained.

## Adaptation notes

- `alpha-landing.spec.ts`: replaced Classic/Alpha banner assertions with standalone root login check.
- `debug.spec.ts`: verifies debug API remains unavailable; debug middleware removed from stock ABS fixture and standalone image scope.
- `ad-analysis.spec.ts`: uses `/psb/api/items/:id/analysis` contract and enqueue route; no ABS analysis fields or fake socket event.
- `shelf-bleed.spec.ts`: protects left content inset, tests hit testing outside inset, preserves right-edge checks; recent episode matcher uses `/psb/api/...`.
- `proxy-contract.spec.ts`: validates contract-shaped `{ episodes: record }` response, auth, ACL and proxy prefix.
- Remaining specs: root `/` SPA and root deep links; native ABS APIs stay under their stock routes. Any per-test request overrides remain local to that spec.

Latest container gate on ffunraid: **170 passed, 28 failed, 7 skipped / 205 tests**. Four launches used: rounds 1 and 3 failed discovery (AppleDouble archive files; missing JSON import attribute); round 2 ran 177/21/7; round 4 ran 170/28/7. No further rounds run. Gate remains failed; do not merge.

Final runtime image: `sha256:62129769b83b49a3ce60665242292740c836f1eba8b6474cea7c9bcf534a79ed`. JSON: `/private/tmp/opencode/standalone-gate-round4.json`; exact failed assertions and stack locations: `/private/tmp/opencode/standalone-gate-remaining.txt`. Unit suite: 437 passed; typecheck, Biome and build passed.

Remaining failures: analysis completion icon count (1); audiobook observations still sent through production proxy (1); audit feed count missing (1); book download/table ownership regression (7); feed-only download/shelf/permission rendering (6); HLS marker absent (1); shared socket connection/auth counts (2); library selection missing (1); missing-asset cache header absent (1); PDF canvas unpainted (1); disposed shelf response intercepts (3); shell and stale fixture links absent (2); local timeline marker geometry absent (1). Counts total 28. These are observed failure boundaries; unresolved root causes are not certified.

Cleanup proof: `/private/tmp/opencode/standalone-gate-cleanup-proof.txt`. All seven test containers, tagged/superseded test images and isolated network removed. Stable and experiment container IDs/image digests match `/private/tmp/opencode/standalone-gate-before.txt`. No push or deployment.

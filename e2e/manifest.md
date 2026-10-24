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

Latest fresh-image container gate on ffunraid: **198 passed, 0 failed, 7 skipped / 205 tests**. Round 5 ran 195/3/7; round 6 closed all remaining failures. JSON: `/private/tmp/opencode/standalone-gate-round6.json`.

Final runtime image: `sha256:9838b2d6a41eac4541df07c2a4bda8864e35376a6c245d0d3cce7997eb369e2e`, built from `702e9067`. Unit suite: **437 passed**; typecheck, Biome and build passed. No assertions dropped during gate repair; PDF canvas test passes in headless Linux after fixing `.mjs` worker MIME type.

Repair causes: feed mock omitted enclosure and podcast metadata; sign-in helper returned before auth completed; analysis completion assertion expired before 30-second poll; audit mock confused unplayed with finished count; audio-file filtering removed native file actions; duplicate React sibling keys orphaned book tables after updates; HLS analysis used wrong episode ID; geometry test searched wrong ancestor before sidecar result; observations used SPA proxy instead of mock control; absent cache header is valid for missing asset. Other round-4 socket/shelf/navigation failures did not recur after fixture/auth alignment.

## Recorded skips

- `parity-contracts.spec.ts`: generated Classic leaf-route comparison requires separately generated Classic artifact (1).
- `parity-contracts.spec.ts`: R08.book, R08.podcast, R04.account need Classic fixture adapter; not runtime parity evidence (3).
- `real-playback.spec.ts`: real-low, real-end-world, full book require `REAL_PLAYBACK=1` plus local ignored media cache; tests never download media (3).

Cleanup proof: `/private/tmp/opencode/standalone-gate-cleanup6.txt`. Four named test containers, four final tagged images, four superseded images and isolated network removed. Frontend bound only to `127.0.0.1:43810`; no Traefik labels, no `traefik` or `vpn-egress` membership. Stable and experiment container IDs/image digests unchanged before/after. Transfer used `git archive`, with no AppleDouble files. No push or deployment.

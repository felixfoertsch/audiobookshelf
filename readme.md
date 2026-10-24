# Audiobookshelf Modern UI

Standalone Modern UI for stock [Audiobookshelf](https://github.com/advplyr/audiobookshelf) 2.37.1. Derived from Audiobookshelf by advplyr and contributors; original GPL-3.0 license and history retained. Backend and Classic UI are not included.

```sh
bun install --frozen-lockfile
bun dev
```

Production: `docker build -t audiobookshelf-modern-ui .`, then run port 8080 with `ABS_UPSTREAM=https://audiobookshelf.felixfoertsch.de` and `PSB_UPSTREAM=http://podcast-sponsorblock:3000`. `EXTERNAL_SCHEME=https` is trusted deployment configuration; never derive external scheme from browser-supplied forwarded headers. Native authentication, catalog and playback belong to ABS. Analysis/feed augmentation uses same-origin `/psb`.

Run full Playwright suite against production image plus isolated ABS/sidecar mocks: `e2e/run-container-suite.sh`. Script expects local Docker images `modern-ui-e2e:frontend`, `modern-ui-e2e:abs`, `modern-ui-e2e:psb`, and `modern-ui-e2e:runner`; CI builds these images first. Unit fixture server runs root routes. Proxy contract tests cover login/refresh cookie, Range, WebSocket, reserved namespaces, sidecar 401/503, and item ACL.

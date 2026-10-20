# Local Classic parity baseline

Classic source remains unchanged. Build with existing locked npm consumer from `client/`:

```fish
CYPRESS_INSTALL_BINARY=0 npm ci
ROUTER_BASE_PATH=/classic NODE_ENV=production npm run generate
```

Do not use `--omit=optional`: Tailwind requires platform-native optional Oxide package. Suppress Cypress binary download with `CYPRESS_INSTALL_BINARY=0`, not by omitting every optional dependency. npm currently warns about undeclared lifecycle-script approvals; generation succeeded without changing manifests/lockfiles.

Artifact: `client/dist/`, generated router: `client/node_modules/.cache/nuxt/router.js`. Actual router base is `/classic/`. Nuxt embeds `/classic` in server URL, Axios base and socket path; changing HTML `<base>` alone is not sufficient. The artifact is local-only; do not ship this specially prefixed baseline as production Classic root.

## Fixture adapter integration contract

No extra ABS backend, initialized database, live account, production request or deployment needed. Existing synthetic fixture owner must add these before enabling comparisons:

- Mount static `client/dist` at `/classic`; use `200.html` fallback for dynamic Classic deep links. Never return HTML for missing `_nuxt` assets or API requests. Static assets include `/classic/_nuxt/...`, icons and localization files. Disable service workers in comparison contexts.
- Route `/classic/status`, `/classic/login`, `/classic/logout`, `/classic/auth/refresh` and `/classic/api/...` into same in-memory fixture state as modern APIs. Do not rewrite these into `/new`.
- `GET /classic/status`: `isInit: true`, `language`, `authMethods: ['local']`, `authFormData`. This prevents first-run root initialization; no `/init` should occur.
- `POST /classic/login` and `POST /classic/api/authorize`: Classic `pages/login.vue:setUser` requires `{user, userDefaultLibraryId, serverSettings, Source, ereaderDevices}`. `serverSettings.language` is accessed directly; set `chromecastEnabled: false` to avoid remote Cast script. Use synthetic user with actual Classic `permissions`, `settings`, `mediaProgress`, `bookmarks`, type and library/tag restrictions; derive complete shape from `client/store/user.js`, not a modern-only `{id, username, accessToken}` response.
- Classic login restoration reads localStorage `token` then calls `/api/authorize`, not only `/auth/refresh`. Authenticate independent Classic/modern browser contexts as same fixture identity before protected navigation. Never seed Vue internals to bypass normal auth.
- `GET /classic/api/libraries` and subsequent library home/filter/personalized/item APIs must use same records and native response shapes as modern fixture. `client/store/libraries.js` and relevant `client/pages`/components own these shapes. Unsupported endpoint must fail visibly, never silently return `{}` or fabricated empty success.
- Socket.IO websocket endpoint is `/classic/socket.io`. On connection Classic emits `auth`; respond with `init` containing at least `usersOnline` and native fields consumed by tested workflows. Existing modern plain websocket emulation is not automatically Socket.IO-compatible. Without this adapter connection errors remain baseline failures, not proven UI defects.
- Replay mutations in isolated equivalent state per client. Comparing modern after Classic mutated shared state is not a 1:1 test. Reset fixture between contexts or offer separate equivalent state namespaces.

Source trace: `client/nuxt.config.js`, `client/pages/login.vue:181–200,226–275`, `client/middleware/authenticated.js`, `client/layouts/default.vue:147–155,382–415`, `client/store/user.js`, `client/store/libraries.js`.

## Prepared contracts, not verified parity

`web/e2e/parity-contracts.spec.ts` derives route patterns from `docs/frontend-parity.md`. `CLASSIC_CONTRACTS=1` enables generated-router versus ledger assertion. Actual build has 41 leaf routes matching ledger exactly.

Default discovery reads no repository docs, Classic strings or generated router. `CLASSIC_CONTRACTS=1` requires ledger and generated router; `PARITY_COMPARE=1` requires Classic English strings and case inputs. Missing explicitly enabled prerequisites fail with an actionable path rather than silently passing. Portable Docker discovery needs none of these artifacts.

Only three semantic browser slices are prepared: R08 book playback, R08 podcast playback and R04 account sign-out. These compare required meaning and native action outcomes, not whole-body text, HTML tags, decorative controls or layout. Item cases require same fixture title visible, enabled Play, POST native play path with html5 mediaPlayer, successful session and advancing audio. Account case requires username field, enabled local logout, successful POST logout and cleared token. Source references live beside assertions. Other route/dialog/permission manifests remain pending; no claim that all 41 routes have actionable comparisons.

Each client signs in through its own native synthetic login before navigation, in an isolated browser context. Adapter must supply same identity and restore/reset equivalent state; current fixture adapter is still prerequisite. Initial readiness uses successful login/navigation and specific loaded information/control visibility, not network-idle timing. Unexpected API errors fail; only signed-out auth-refresh 401 is allowed.

After fixture adapter and canonical modern routes land, from web/:

```fish
CLASSIC_CONTRACTS=1 mise exec -- bunx playwright test e2e/parity-contracts.spec.ts --grep "actual generated"
PARITY_COMPARE=1 PARITY_CASES='{"R08.book":{"id":"book-1","title":"The Glass Orchard"},"R08.podcast":{"id":"podcast-1","title":"USE EXACT FIXTURE TITLE","episodeId":"USE FIXTURE EPISODE ID"},"R04.account":{"username":"listener"}}' mise exec -- bunx playwright test e2e/parity-contracts.spec.ts
```

PARITY_CASES keys are route-role identifiers, never a global id shared across unrelated author/user/item records. Supply exact current data.ts values; example podcast placeholders must be replaced. Missing enabled-case inputs fail rather than pass or silently skip. Comparisons are opt-in pending adapter, not runtime evidence. Test listing contains four tests: one route-inventory contract and three semantic slices.

Service workers stay blocked. Dedicated fixture4180 and primary preview4179 remain separate. No build, browser comparison, credential creation or deployment is authorized by this preparation.

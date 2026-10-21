## Fork image CI measurements

Source: Gitea [issue #3](https://git.felixfoertsch.de/felixfoertsch/audiobookshelf/issues/3), Actions run jobs API (`started_at`/`completed_at`) and job BuildKit logs. All times below are seconds. Job total includes runner setup/teardown, not queue time; steps need not sum to total. Every run starts cold under the declared [disposable-builder policy](https://git.felixfoertsch.de/felixfoertsch/dotfiles/src/branch/main/infrastructure/gitea/linux-disposable.md). Only the later runtime invocation's modern artifact is warm.

| Run | Source SHA | Checkout | Modern check | Runtime build | Media/SQLite smoke | Publish | Job total | Result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1443 | `2e51a22d` | 2 | 688 | 410 | 4¹ | 11 | 1185 | success |
| 1444 | `9d2f57df` | 5 | 718 | 435 | 4¹ | 17 | 1252 | success |
| 1445 | `6a90a70d` | 2 | 985 | 616 | 4¹ | skipped | 1674 | success |
| 1446 | `e9d83d69` | 2 | 1031 | 630 | 5 | skipped | 1742 | success |
| 1447 | `e9d83d69` | 4 | 1046 | 1264 | not run | not run | 2437 | failure² |
| 1454 | `86583381` | 1 | 408 | 256 | 4 | 16 | 787 | success |
| 1457 | `7ae37e6a` | 3 | 490 | 264 | 5 | 15 | 854 | success |
| 1459 | `4c8e3e06` | 2 | 509 | 253 | 4 | 14 | 852 | success |
| 1460 | `3f7ac714` | 2 | 523 | 246 | 5 | 18 | 871 | success |

¹ SQLite extension smoke added in `e9d83d69`. ² API reports runtime failure; retained log ends during COPY, without a root-cause error. Not a successful baseline.

Selected BuildKit instruction durations (overlap possible; do not sum into savings):

| Run | Modern build RUN³ | Playwright setup | Check RUN(s)⁴ | Classic generate⁵ | Server compile⁶ | Native deps⁷ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1443 | 51.1 | 104.6 | 104.6 / 99.9 | 221.1 | 51.9 | 29.2 |
| 1444 | 53.6 | 99.6 | 111.4 / 115.9 | 239.7 | 59.7 | 31.4 |
| 1445 | 106.0 | 102.2 | 114.6 / 109.4 | 298.2 | 219.6 | 158.3 |
| 1446 | 109.4 | 106.4 | 119.2 / 115.8 | 274.5 | 171.6 | 159.3 |
| 1447 | 112.6 | 134.4 | 117.7 / 118.5 | 297.6 | 215.2 | 60.8 |
| 1454 | 20.6 | 121.0⁸ | 278.1 | 189.6 | 61.1 | 43.0 |
| 1457 | 24.3 | 125.1⁸ | 355.9 | 203.2 | 75.6 | 38.9 |
| 1459 | 21.3 | 119.5⁸ | 379.3 | 193.1 | 67.4 | 50.0 |
| 1460 | 22.1 | 120.1⁸ | 390.8 | 189.6 | 71.2 | 47.7 |

³ After layer collapse (`8ddf7b47`), includes frozen install. ⁴ Before collapse: typecheck/lint/Vitest then browser RUN; after collapse: one RUN includes setup and all checks. ⁵ After collapse includes `npm ci`. ⁶ 1445–1447 exclude separate install; other runs include it. ⁷ After collapse includes apk/extension download. ⁸ Elapsed setup output inside check RUN, not separate layer.

Native snapshotter on VFS makes extra layers expensive: 1446's one-file `COPY package.json` took 117.2 s; after collapse, runtime linked artifact COPYs take roughly 0.1–2.1 s. Modern build is `CACHED` during runtime build in every measured run: no duplicate frontend build remains. Later successful jobs took 787–871 s versus original 1185–1252 s, but source, base-image digests and test counts changed; this is not a controlled warm-run comparison.

Current small optimization installs only Playwright's locked headless shell (`--only-shell`), matching `headless: true` with no channel override. Previously unused headed Chrome downloaded for 12.5–15.2 s in runs 1454–1460; avoiding its download/extraction removes that work, not the full 119–125 s setup (wall-time saving still needs CI measurement). Browsers installed in runner container are outside remote BuildKit stages; do not substitute an unversioned system browser. FFmpeg mirror DNS failures in 1457/1459 recovered automatically after about 1.5/0.8 s; they were not failed browser gates. Keep required locked FFmpeg download rather than bypassing errors.

Cold tradeoff: collapsed stages reinstall on any mounted source change; `web`, ebook assets, strings or root manifest invalidate modern build and checks; `client` invalidates Classic; server manifests/source/config invalidate compile. Base-image digest or instruction changes also invalidate descendants. Production dependency layer stays keyed to manifests, platform and base image. Cache mounts would not survive job teardown, and each npm/Bun install runs once per stage; no persistent cache or new cache trust boundary added.

Next CI acceptance: preserve typecheck, lint, Vitest, Playwright, Classic generate, runtime build, network-disabled FFmpeg/Chromaprint and SQLite smoke, and SHA-tagged publication. Measure at least three successful comparable runs after integration; repeat within one isolated builder generation for truly warm measurements, without pruning shared state. Confirm locked shell launches and unused headed download disappears. Agree improvement target and compare equivalent source/base digests before closing #3.

# OpenAPI specification

This directory includes the OpenAPI spec for the ABS server. The spec is made up of a number of individual `yaml` files located here and in the subfolders, with `root.yaml` being the file that references all of the others. The files are organized to have the same hierarchy as the server source files. The full spec is bundled into one file in `openapi.json`.

The spec is linted and bundled using [`redocly-cli`](https://redocly.com/docs/cli/). This tool also generates HTML docs for the spec.

The tools created by [`pb33f`](https://pb33f.io/), specifically `vacuum` and `wiretap`, are also useful for linting and verification. These tools check for some other things, such as validating requests to and responses from the server.

### Bundling the spec

The command used to bundle the spec into a `yaml` file is `redocly bundle root.yaml > bundled.yaml`.

The `yq` tool is used to convert the `yaml` to a `json` using the `yq -p yaml -o json bundled.yaml > openapi.json`.

### Linting the spec

The command used to lint the spec is `redocly lint root.yaml`

To generate an HTML report using `vacuum`, you can use `vacuum html-report [file]` to generate `report.html` and view the report in your browser.

### Generating documentation

Redocly allows for creating a static HTML page to document the API. This is done by using `redocly build-docs [file]` and supports exploded specs.

### Putting it all together

The full command that I run to bundle the spec and generate the documentation is:

```
redocly bundle root.yaml > bundled.yaml && \
yq -p yaml -o json bundled.yaml > openapi.json && \
redocly build-docs openapi.json
```

ARG NUSQLITE3_DIR="/usr/local/lib/nusqlite3"
ARG NUSQLITE3_PATH="${NUSQLITE3_DIR}/libnusqlite3.so"

# CI BuildKit uses the native snapshotter on VFS: every instruction copies the
# whole parent filesystem. Heavy stages therefore bind-mount sources and do
# all work in one RUN; the runtime stage uses COPY --link.

### STAGE 0: Build client ###
FROM node:24-alpine AS build-client
WORKDIR /client
RUN --mount=type=bind,source=client,target=/src \
	cp -a /src/. . && npm ci && npm run generate

### Modern preview: same backend, optional static /new/ UI ###
FROM --platform=$BUILDPLATFORM oven/bun:1.4.3 AS web-bun
FROM --platform=$BUILDPLATFORM node:24-trixie-slim AS build-web
# jsdom/Vitest require real Node; Bun's image aliases `node` to Bun.
COPY --from=web-bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /web
RUN --mount=type=bind,source=web,target=/src \
	--mount=type=bind,source=client/assets/ebooks,target=/client/assets/ebooks \
	--mount=type=bind,source=client/strings,target=/client/strings \
	--mount=type=bind,source=package.json,target=/package.json \
	ln -s /usr/local/bin/bun /usr/local/bin/bunx \
	&& cp -a /src/. . \
	&& bun install --frozen-lockfile \
	&& bun run build

# CI checks the exact modern artifact copied into the runtime image.
# Headless checks need only Chromium's shell, not the unused headed browser.
# Browsers stay in this stage; runtime copies only /web/dist from build-web.
FROM build-web AS check-web
RUN --mount=type=bind,source=client/assets/ebooks,target=/client/assets/ebooks \
	--mount=type=bind,source=client/strings,target=/client/strings \
	--mount=type=bind,source=package.json,target=/package.json \
	node ./node_modules/@playwright/test/cli.js install --with-deps --only-shell chromium \
	&& bun run typecheck && bun run lint && bun run test \
	&& node ./node_modules/@playwright/test/cli.js test

### STAGE 1: Compile server on the builder CPU (avoid QEMU SIGILL from tsc on arm64) ###
FROM --platform=$BUILDPLATFORM node:24-alpine AS compile-server
WORKDIR /server
RUN --mount=type=bind,source=package.json,target=/server/package.json \
	--mount=type=bind,source=package-lock.json,target=/server/package-lock.json \
	--mount=type=bind,source=index.js,target=/server/index.js \
	--mount=type=bind,source=tsconfig.server.json,target=/server/tsconfig.server.json \
	--mount=type=bind,source=server,target=/server/server \
	--mount=type=bind,source=test,target=/server/test \
	npm ci --include=dev --ignore-scripts && npm run build:server

### STAGE 2: Install native server deps for the target arch ###
FROM node:24-alpine AS build-server

ARG NUSQLITE3_DIR
ARG TARGETPLATFORM

ENV NODE_ENV=production

WORKDIR /server
COPY package.json package-lock.json ./

RUN apk add --no-cache --update curl make python3 g++ unzip && \
  case "$TARGETPLATFORM" in \
  "linux/amd64") \
  curl -L -o /tmp/library.zip "https://github.com/mikiher/nunicode-sqlite/releases/download/v1.2/libnusqlite3-linux-musl-x64.zip" ;; \
  "linux/arm64") \
  curl -L -o /tmp/library.zip "https://github.com/mikiher/nunicode-sqlite/releases/download/v1.2/libnusqlite3-linux-musl-arm64.zip" ;; \
  *) echo "Unsupported platform: $TARGETPLATFORM" && exit 1 ;; \
  esac && \
  unzip /tmp/library.zip -d $NUSQLITE3_DIR && \
  rm /tmp/library.zip && \
  npm ci --omit=dev

### STAGE 3: Create minimal runtime image ###
FROM node:24-alpine AS runtime

ARG NUSQLITE3_DIR
ARG NUSQLITE3_PATH

WORKDIR /app

# Install only runtime dependencies
RUN apk add --no-cache --update \
  tzdata \
  ffmpeg \
  chromaprint \
  tini

COPY --link --from=build-server /server /app
COPY --link index.js /app/
COPY --link server /app/server
COPY --link --from=compile-server /server/dist-server /app/dist-server
COPY --link --from=build-client /client/dist /app/client/dist
COPY --link --from=build-web /web/dist /app/web/dist
COPY --link --from=build-server ${NUSQLITE3_PATH} ${NUSQLITE3_PATH}

EXPOSE 80

ENV PORT=80
ENV NODE_ENV=production
ENV CONFIG_PATH="/config"
ENV METADATA_PATH="/metadata"
ENV SOURCE="docker"
ENV NUSQLITE3_DIR=${NUSQLITE3_DIR}
ENV NUSQLITE3_PATH=${NUSQLITE3_PATH}

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist-server/index.js"]

# Test tools mount only for this RUN; published runtime never receives dev dependencies.
FROM runtime AS check-runtime
RUN --mount=type=bind,from=compile-server,source=/server/node_modules,target=/native-test-deps \
	DAI_NATIVE_REQUIRED=1 FPCALC_PATH=/usr/bin/fpcalc FFMPEG_PATH=/usr/bin/ffmpeg NODE_PATH=/native-test-deps \
	node /native-test-deps/mocha/bin/mocha.js dist-server/test/server/utils/daiNativeSafety.test.js

# Full backend gate includes modern-serving HTTP tests and serializer drift check.
# Keep dev dependencies and fixture out of published runtime.
FROM runtime AS check-backend
RUN --mount=type=bind,from=compile-server,source=/server/node_modules,target=/backend-test-deps \
	--mount=type=bind,from=build-server,source=/server/node_modules/sqlite3,target=/backend-test-deps/sqlite3 \
	--mount=type=bind,source=web/src/test/serializer-fixtures.json,target=/app/web/src/test/serializer-fixtures.json \
	apk add --no-cache openssl \
	&& NODE_PATH=/backend-test-deps node /backend-test-deps/mocha/bin/mocha.js dist-server/test

FROM runtime AS final

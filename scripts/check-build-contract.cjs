// Run with: node scripts/check-build-contract.cjs
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const read = (path) => readFileSync(resolve(__dirname, '..', path), 'utf8')
const dockerfile = read('Dockerfile')

function check(source) {
	const stage = (name) => {
		const match = source.match(new RegExp(`^FROM (.+) AS ${name}\\n([\\s\\S]*?)(?=^FROM |$(?![\\s\\S]))`, 'm'))
		assert.ok(match, `missing ${name}`)
		return { from: match[1], body: match[2] }
	}
	for (const [name, manifest, install] of [
		['build-client', 'client/package.json client/package-lock.json', 'npm ci && npm cache clean --force'],
		['compile-server', 'package.json package-lock.json', 'npm ci --include=dev --ignore-scripts'],
		['build-server', 'package.json package-lock.json', 'npm ci --omit=dev'],
		['web-deps', 'web/package.json web/bun.lock', 'bun install --frozen-lockfile'],
	]) {
		const body = stage(name).body
		assert.ok(body.includes(`RUN ${install}\n`))
		const before = body.split(`RUN ${install}\n`)[0]
		assert.ok(before.includes(`COPY ${manifest} ./\n`))
		assert.doesNotMatch(before, /^COPY (?!.*package.json|--from=web-bun).+/m, `${name}: source before install`)
	}
	assert.equal(stage('web-deps').from, '--platform=$BUILDPLATFORM node:24-trixie-slim')
	assert.equal(stage('check-web-base').from, 'web-deps')
	assert.equal(stage('build-web').from, 'web-deps')
	assert.equal(stage('check-web').from, 'check-web-base')
	assert.doesNotMatch(stage('check-web-base').body, /^COPY /m)
	assert.match(stage('check-web-base').body, /^RUN node \.\/node_modules\/@playwright\/test\/cli.js install --with-deps chromium$/m)
	assert.match(stage('build-web').body, /^RUN bun run build$/m)
	for (const instruction of [
		'COPY --from=build-web /web/dist ./dist',
		'COPY --from=build-web /web/src/routeTree.gen.ts ./src/routeTree.gen.ts',
		'RUN bun run typecheck && bun run lint && bun run test',
		'RUN node ./node_modules/@playwright/test/cli.js test',
	]) assert.ok(stage('check-web').body.includes(`${instruction}\n`), instruction)
	assert.doesNotMatch(stage('check-web').body, /RUN .*\b(?:build|e2e)\b/)
	assert.match(source, /^COPY --from=build-web \/web\/dist \/app\/web\/dist$/m)
	assert.doesNotMatch(source, /\b(?:bunx|npx) playwright/)
	assert.equal(stage('compile-server').from, '--platform=$BUILDPLATFORM node:24-alpine')
	assert.equal(stage('build-server').from, 'node:24-alpine')
	assert.match(stage('build-server').body, /ARG TARGETPLATFORM\n/)
	assert.match(stage('build-server').body, /"linux\/amd64"\)[\s\S]*libnusqlite3-linux-musl-x64.zip/)
	assert.match(stage('build-server').body, /"linux\/arm64"\)[\s\S]*libnusqlite3-linux-musl-arm64.zip/)
	assert.match(stage('build-server').body, /Unsupported platform: \$TARGETPLATFORM" && exit 1/)
	assert.equal(JSON.parse(read('web/package.json')).scripts.e2e, 'bun run build && playwright test')
}
check(dockerfile)
assert.throws(() => check(dockerfile.replace('FROM web-deps AS build-web', 'FROM check-web-base AS build-web')))
assert.throws(() => check(dockerfile.replace('RUN npm ci --omit=dev\n', 'RUN npm ci --omit=dev --ignore-scripts\n')))
console.log('Build cache contract passed; browser ancestry and native-script regressions rejected')

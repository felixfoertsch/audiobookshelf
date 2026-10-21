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
	for (const [name, install] of [
		['build-client', 'npm ci && npm run generate'],
		['build-web', 'bun install --frozen-lockfile'],
		['compile-server', 'npm ci --include=dev --ignore-scripts && npm run build:server'],
		['build-server', 'npm ci --omit=dev'],
	]) assert.ok(stage(name).body.includes(install), `${name}: ${install}`)
	// VFS-backed native snapshotter copies the whole parent per instruction.
	for (const name of ['build-client', 'build-web', 'check-web', 'compile-server'])
		assert.ok(stage(name).body.split('\n').filter((line) => /^RUN /.test(line)).length === 1, `${name}: one RUN`)
	assert.equal(stage('build-web').from, '--platform=$BUILDPLATFORM node:24-trixie-slim')
	assert.equal(stage('check-web').from, 'build-web')
	assert.doesNotMatch(stage('build-web').body, /playwright/)
	assert.match(stage('check-web').body, /node \.\/node_modules\/@playwright\/test\/cli.js install --with-deps --only-shell chromium/)
	assert.match(stage('check-web').body, /bun run typecheck && bun run lint && bun run test/)
	assert.match(stage('check-web').body, /node \.\/node_modules\/@playwright\/test\/cli.js test$/m)
	assert.doesNotMatch(stage('check-web').body, /bun run (?:build|e2e)/)
	assert.match(source, /^COPY --link --from=build-web \/web\/dist \/app\/web\/dist$/m)
	assert.doesNotMatch(source, /--from=check-web/)
	assert.doesNotMatch(source, /\b(?:bunx|npx) playwright/)
	assert.equal(stage('compile-server').from, '--platform=$BUILDPLATFORM node:24-alpine')
	assert.equal(stage('build-server').from, 'node:24-alpine')
	assert.doesNotMatch(stage('build-server').body, /--ignore-scripts/)
	assert.match(stage('build-server').body, /ARG TARGETPLATFORM\n/)
	assert.match(stage('build-server').body, /"linux\/amd64"\)[\s\S]*libnusqlite3-linux-musl-x64.zip/)
	assert.match(stage('build-server').body, /"linux\/arm64"\)[\s\S]*libnusqlite3-linux-musl-arm64.zip/)
	assert.match(stage('build-server').body, /Unsupported platform: \$TARGETPLATFORM" && exit 1/)
	assert.equal(JSON.parse(read('web/package.json')).scripts.e2e, 'bun run build && playwright test')
}
assert.match(read('web/playwright.config.ts'), /headless: true/)
assert.doesNotMatch(read('web/playwright.config.ts'), /\bchannel:/)
check(dockerfile)
assert.throws(() => check(dockerfile.replace('--only-shell ', '')))
assert.throws(() => check(dockerfile.replace('FROM build-web AS check-web', 'FROM web-bun AS check-web')))
assert.throws(() => check(dockerfile.replace('npm ci --omit=dev', 'npm ci --omit=dev --ignore-scripts')))
assert.throws(() => check(dockerfile.replace('\tnpm ci --include=dev', '\tRUN true\nRUN npm ci --include=dev')))
console.log('Build contract passed; browser ancestry, native-script and layer-count regressions rejected')

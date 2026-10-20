// Run against isolated fixture: FIXTURE_PORT=4191 bun e2e/classic-preview/session-track.test.ts
import assert from 'node:assert/strict'

const origin = `http://127.0.0.1:${process.env.FIXTURE_PORT || 4191}`
for (const prefix of ['', '/abs', '/classic']) {
	const login = await fetch(`${origin}${prefix}/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ username: 'listener', password: 'password' }),
	})
	assert.equal(login.status, 200)
	const { user } = await login.json()
	const headers = {
		authorization: `Bearer ${user.accessToken}`,
		'content-type': 'application/json',
	}
	const start = await fetch(`${origin}${prefix}/api/items/book-1/play`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ mediaPlayer: 'html5' }),
	})
	assert.equal(start.status, 200)
	const session = await start.json()
	const track = `${origin}${prefix}/public/session/${session.id}/track/${session.audioTracks[0].index}`
	const ranged = await fetch(track, { headers: { range: 'bytes=0-1023' } })
	assert.equal(ranged.status, 206)
	assert.equal((await ranged.arrayBuffer()).byteLength, 1024)
	const head = await fetch(track, { method: 'HEAD' })
	assert.equal(head.status, 200)
	assert.ok(Number(head.headers.get('content-length')) > 1024)
	assert.equal((await head.arrayBuffer()).byteLength, 0)
	for (const [index, status] of [
		['999', 404],
		['-1', 400],
		['1.5', 400],
		['nope', 400],
	] as const)
		assert.equal(
			(
				await fetch(
					`${origin}${prefix}/public/session/${session.id}/track/${index}`,
				)
			).status,
			status,
		)
	assert.equal(
		(await fetch(`${origin}${prefix}/public/session/missing/track/1`)).status,
		404,
	)
	assert.equal((await fetch(track, { method: 'POST' })).status, 405)
	assert.equal(
		(
			await fetch(`${origin}${prefix}/api/session/${session.id}/close`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ currentTime: 0, timeListened: 0 }),
			})
		).status,
		200,
	)
	assert.equal((await fetch(track)).status, 404)
	console.log(
		`${prefix || 'root'} session track: range, HEAD, invalid/missing, method, close passed`,
	)
}

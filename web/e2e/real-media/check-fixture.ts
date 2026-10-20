// Standalone, network-free HTTP checks. Starts/stops only its exact temporary child.
import assert from 'node:assert/strict'
import { io } from 'socket.io-client'

const child = Bun.spawn(['bun', 'e2e/fixture.ts'], {
	cwd: new URL('../../', import.meta.url).pathname,
	env: {
		...process.env,
		FIXTURE_PORT: '4183',
		CLASSIC_COMPARE: process.env.CLASSIC_COMPARE || '0',
	},
	stdout: 'pipe',
	stderr: 'pipe',
})
const origin = 'http://127.0.0.1:4183'
async function api(
	path: string,
	method = 'GET',
	body?: unknown,
	token = 'fixture-access',
) {
	return fetch(`${origin}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json',
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	})
}
try {
	let ready = false
	for (let i = 0; i < 100; i++) {
		try {
			if ((await fetch(`${origin}/health`)).ok) {
				ready = true
				break
			}
		} catch {}
		await Bun.sleep(50)
	}
	assert(ready, 'Temporary fixture startup failed')
	if (process.env.FIXTURE_UNINITIALIZED === '1') {
		assert.equal((await (await api('/status')).json()).isInit, false)
		assert.equal(
			(await api('/init', 'POST', { username: 'root', password: 'password' }))
				.status,
			400,
		)
		assert.equal(
			(
				await api('/init', 'POST', {
					newRoot: { username: 'setup-root', password: 'setup-secret' },
				})
			).status,
			200,
		)
		assert.equal((await (await api('/status')).json()).isInit, true)
		assert.equal(
			(await api('/login', 'POST', { username: 'root', password: 'password' }))
				.status,
			401,
		)
		assert.equal(
			(
				await api('/login', 'POST', {
					username: 'setup-root',
					password: 'setup-secret',
				})
			).status,
			200,
		)
		assert.equal(
			(
				await api('/init', 'POST', {
					newRoot: { username: 'x', password: 'x' },
				})
			).status,
			500,
		)
		console.log('PASS: isolated setup transition and new root credentials')
		process.exitCode = 0
	} else {
		assert.equal((await api('/login')).status, 405)
		assert.equal((await api('/status', 'POST', {})).status, 405)
		for (const path of process.env.CLASSIC_COMPARE === '1'
			? ['/socket.io', '/classic/socket.io', '/abs/socket.io']
			: []) {
			const socket = io(origin, {
				path,
				transports: ['websocket'],
				reconnection: false,
				autoConnect: false,
			})
			try {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(
						() => reject(new Error(`Socket timeout: ${path}`)),
						3000,
					)
					socket.once('connect', () => {
						clearTimeout(timer)
						resolve()
					})
					socket.once('connect_error', reject)
					socket.connect()
				})
				let initialized = false
				socket.on('init', () => {
					initialized = true
				})
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(
						() => reject(new Error('Missing auth_failed')),
						2000,
					)
					socket.once('auth_failed', () => {
						clearTimeout(timer)
						resolve()
					})
					socket.emit('auth', 'wrong')
				})
				assert.equal(initialized, false)
				const init = await new Promise<{ userId: string }>(
					(resolve, reject) => {
						const timer = setTimeout(
							() => reject(new Error('Missing init')),
							2000,
						)
						socket.once('init', (data) => {
							clearTimeout(timer)
							resolve(data)
						})
						socket.emit('auth', 'fixture-access')
					},
				)
				assert.equal(init.userId, 'fixture-listener')
				const event = new Promise<{ id: string }>((resolve, reject) => {
					const timer = setTimeout(
						() => reject(new Error('Missing user_updated')),
						2000,
					)
					socket.once('user_updated', (data) => {
						clearTimeout(timer)
						resolve(data)
					})
				})
				await api('/api/me/progress/book-1', 'PATCH', { currentTime: 2 })
				assert.equal((await event).id, 'fixture-listener')
			} finally {
				socket.disconnect()
			}
		}
		const owned = await (await api('/api/items/book-1/play', 'POST', {})).json()
		assert.equal(
			(
				await api(
					`/api/session/${owned.id}/sync`,
					'POST',
					{ currentTime: 1 },
					'fixture-admin-access',
				)
			).status,
			403,
		)
		assert.equal(
			(
				await api(
					`/api/session/${owned.id}/close`,
					'POST',
					{},
					'fixture-admin-access',
				)
			).status,
			403,
		)
		assert.equal(
			(
				await fetch(`${origin}/api/session/${owned.id}/sync`, {
					method: 'POST',
					headers: { authorization: 'Bearer fixture-access' },
					body: '{',
				})
			).status,
			400,
		)
		assert.equal(
			(await api(`/api/session/${owned.id}/sync`, 'POST', { currentTime: 1 }))
				.status,
			200,
		)
		assert.equal(
			(await api('/login', 'POST', { username: 'listener', password: 'bad' }))
				.status,
			401,
		)
		assert.equal(
			(
				await api('/login', 'POST', {
					username: 'unknown',
					password: 'password',
				})
			).status,
			401,
		)
		const login = await api('/classic/login', 'POST', {
			username: 'listener',
			password: 'password',
		})
		assert.equal(login.status, 200)
		assert.equal((await login.json()).serverSettings.chromecastEnabled, false)
		assert.equal((await api('/api/me', 'GET', undefined, 'wrong')).status, 401)
		assert.equal((await api('/api/libraries/forbidden/items')).status, 403)
		assert.equal((await api('/api/me')).status, 200)
		for (const path of [
			'/api/me',
			'/api/libraries/podcasts',
			'/api/libraries/books/personalized',
			'/api/libraries/books/filterdata',
			'/api/libraries/books/authors',
			'/api/libraries/books/narrators',
			'/api/libraries/books/series',
			'/api/libraries/books/collections',
			'/api/libraries/books/playlists',
			'/api/tasks',
		])
			assert.equal((await api(path)).status, 200, path)
		assert.equal(
			(
				await api('/api/me/progress/book-1', 'PATCH', {
					currentTime: 4,
					duration: 13.883375,
				})
			).status,
			200,
		)
		assert.equal(
			(await (await api('/classic/api/me/progress/book-1')).json()).currentTime,
			4,
		)
		assert.equal(
			(
				await api('/api/me/item/book-1/bookmark', 'POST', {
					time: 3,
					title: 'Check',
				})
			).status,
			200,
		)
		assert.equal(
			(await (await api('/classic/api/me/bookmarks/book-1')).json())
				.bookmarks[0].title,
			'Check',
		)
		assert.equal(
			(
				await (
					await api(
						'/api/me/bookmarks',
						'GET',
						undefined,
						'fixture-admin-access',
					)
				).json()
			).bookmarks.length,
			0,
		)
		assert.equal(
			(
				await api('/api/collections', 'POST', {
					name: 'No',
					libraryId: 'books',
				})
			).status,
			403,
		)
		const collection = await (
			await api(
				'/api/collections',
				'POST',
				{ name: 'New', libraryId: 'books', books: ['book-1'] },
				'fixture-admin-access',
			)
		).json()
		assert.equal(
			(await (await api(`/api/collections/${collection.id}`)).json()).books[0]
				.id,
			'book-1',
		)
		const playlist = await (
			await api('/api/playlists', 'POST', {
				name: 'New',
				libraryId: 'books',
				items: [{ libraryItemId: 'book-1' }],
			})
		).json()
		assert.equal(
			(await (await api(`/classic/api/playlists/${playlist.id}`)).json())
				.items[0].libraryItemId,
			'book-1',
		)
		assert.equal(
			(
				await api(
					'/api/podcasts/feed',
					'POST',
					{ rssFeed: 'https://example.com/feed' },
					'fixture-admin-access',
				)
			).status,
			422,
		)
		for (const [id, episode] of [
			['real-low', 'real-low-ep-1'],
			['real-end-world', 'real-end-world-ep-1'],
			['real-antichrist', ''],
		]) {
			const response = await api(
				`/api/items/${id}/play${episode ? `/${episode}` : ''}`,
				'POST',
				{},
			)
			if (response.status === 404) continue // Optional cache absent in CI.
			assert.equal(response.status, 200)
			const session = await response.json()
			assert.equal(session.audioTracks.length, episode ? 1 : 7)
			for (const track of session.audioTracks) {
				const audio = await fetch(`${origin}${track.contentUrl}`, {
					headers: { range: 'bytes=0-1023' },
				})
				assert.equal(audio.status, 206)
				assert.equal((await audio.arrayBuffer()).byteLength, 1024)
			}
		}
		const feedUrl = 'https://thisislow.com/podcast.rss'
		if ((await api('/api/items/real-low')).ok) {
			assert.equal(
				(
					await api(
						'/api/items/real-low',
						'DELETE',
						undefined,
						'fixture-admin-access',
					)
				).status,
				200,
			)
			assert.equal((await api('/api/items/real-low')).status, 404)
			assert.equal(
				(
					await api(
						'/api/podcasts',
						'POST',
						{
							libraryId: 'podcasts',
							folderId: 'podcasts-folder',
							path: '/local-preview/podcasts/LOW',
							media: { metadata: { feedUrl } },
						},
						'fixture-admin-access',
					)
				).status,
				200,
			)
			assert.equal((await api('/api/items/real-low')).status, 200)
		}
		for (const id of [
			'read-epub',
			'read-pdf',
			'read-comic',
			'read-mobi-broken',
			'read-epub-hostile',
			'read-mobi-hostile',
		]) {
			assert.equal(
				(await api(`/api/items/${id}/ebook`, 'GET', undefined, 'wrong')).status,
				401,
			)
			for (const token of [
				'fixture-access',
				'fixture-admin-access',
				'fixture-root-access',
				'fixture-guest-access',
			]) {
				const file = await api(
					`/api/items/${id}/ebook`,
					'GET',
					undefined,
					token,
				)
				assert.equal(file.status, 200)
				assert((await file.arrayBuffer()).byteLength > 0)
			}
		}
		assert.equal(
			(
				await api('/api/me/password', 'PATCH', {
					password: 'wrong',
					newPassword: 'new',
				})
			).status,
			400,
		)
		assert.equal(
			(
				await api(
					'/api/me/password',
					'PATCH',
					{ password: 'password', newPassword: 'new' },
					'fixture-guest-access',
				)
			).status,
			403,
		)
		assert.equal(
			(
				await api('/api/me/password', 'PATCH', {
					password: 'password',
					newPassword: 'new',
				})
			).status,
			200,
		)
		assert.equal(
			(
				await api('/login', 'POST', {
					username: 'listener',
					password: 'password',
				})
			).status,
			401,
		)
		assert.equal(
			(await api('/login', 'POST', { username: 'listener', password: 'new' }))
				.status,
			200,
		)
		const rootLogin = await api('/login', 'POST', {
			username: 'root',
			password: 'password',
		})
		const cookie = (rootLogin.headers.get('set-cookie') || '').split(';')[0]
		const listed = await (
			await fetch(`${origin}/api/me/sessions`, {
				headers: { authorization: 'Bearer fixture-root-access', cookie },
			})
		).json()
		assert(listed.sessions.some((s: { current: boolean }) => s.current))
		const sid = listed.sessions[0].id
		assert.equal((await api(`/api/me/sessions/${sid}`, 'DELETE')).status, 404)
		assert.equal(
			(
				await api(
					`/api/me/sessions/${sid}`,
					'DELETE',
					undefined,
					'fixture-guest-access',
				)
			).status,
			403,
		)
		assert.equal(
			(
				await api(
					`/api/me/sessions/${sid}`,
					'DELETE',
					undefined,
					'fixture-root-access',
				)
			).status,
			200,
		)
		assert.equal(
			(await fetch(`${origin}/auth/refresh`, { headers: { cookie } })).status,
			401,
		)
		assert.equal(
			(
				await api('/api/me/ereader-devices', 'POST', {
					ereaderDevices: [
						{
							name: 'Reader',
							email: 'reader@example.test',
							availabilityOption: 'specificUsers',
							users: ['fixture-listener'],
						},
					],
				})
			).status,
			200,
		)
		assert.equal(
			(
				await api('/api/me/ereader-devices', 'POST', {
					ereaderDevices: [
						{
							name: 'Reader',
							email: 'reader@example.test',
							availabilityOption: 'specificUsers',
							users: ['fixture-root'],
						},
					],
				})
			).status,
			400,
		)
		assert.equal(
			(
				await api(
					'/api/items/batch/update',
					'POST',
					[
						{
							id: 'book-2',
							mediaPayload: { metadata: { subtitle: 'Changed' } },
						},
					],
					'fixture-admin-access',
				)
			).status,
			200,
		)
		assert.equal(
			(await (await api('/api/items/book-2')).json()).media.metadata.subtitle,
			'Changed',
		)
		assert.equal(
			(
				await api('/api/items/batch/update', 'POST', [
					{ id: 'book-2', mediaPayload: { metadata: {} } },
				])
			).status,
			403,
		)
		assert.equal((await api('/api/me/password', 'POST', {})).status, 405)
		assert.equal(
			(
				await api('/api/me/password', 'PATCH', {
					password: 'new',
					newPassword: 'x',
					extra: true,
				})
			).status,
			400,
		)
		assert.equal((await api('/api/me/sessions', 'POST', {})).status, 405)
		assert.equal(
			(await api('/api/items/read-epub/ebook', 'POST', {})).status,
			405,
		)
		assert.equal(
			(
				await api(
					'/api/share/mediaitem',
					'POST',
					{
						slug: 'bad',
						mediaItemType: 'book',
						mediaItemId: 'book-2',
						expiresAt: null,
						isDownloadable: true,
					},
					'fixture-root-access',
				)
			).status,
			400,
		)
		assert.equal(
			(
				await api(
					'/api/share/mediaitem',
					'POST',
					{
						slug: 'bad',
						mediaItemType: 'book',
						libraryItemId: 'book-2',
						expiresAt: 0,
						isDownloadable: true,
					},
					'fixture-root-access',
				)
			).status,
			400,
		)
		assert.equal(
			(await fetch(`${origin}/public/share/public-book`, { method: 'POST' }))
				.status,
			405,
		)
		const createShare = {
			slug: 'created-share',
			expiresAt: 0,
			mediaItemType: 'book',
			mediaItemId: 'book-2',
			isDownloadable: false,
		}
		assert.equal(
			(await api('/api/share/mediaitem', 'POST', createShare)).status,
			403,
		)
		const createdShareResponse = await api(
			'/api/share/mediaitem',
			'POST',
			createShare,
			'fixture-admin-access',
		)
		assert.equal(createdShareResponse.status, 201)
		const createdShare = await createdShareResponse.json()
		assert.equal(
			(await fetch(`${origin}/public/share/created-share`)).status,
			200,
		)
		assert.equal(
			(
				await api(
					`/api/share/mediaitem/${createdShare.id}`,
					'DELETE',
					undefined,
					'fixture-admin-access',
				)
			).status,
			204,
		)
		assert.equal(
			(await fetch(`${origin}/public/share/created-share`)).status,
			404,
		)
		const publicBook = await fetch(`${origin}/public/share/public-book`)
		const shareCookie = (publicBook.headers.get('set-cookie') || '').split(
			';',
		)[0]
		assert.equal(publicBook.status, 200)
		assert.equal(
			(await fetch(`${origin}/public/share/public-book/track/1`)).status,
			404,
		)
		assert.equal(
			(
				await fetch(`${origin}/public/share/public-book/track/1`, {
					headers: { cookie: shareCookie, range: 'bytes=0-1023' },
				})
			).status,
			206,
		)
		assert.equal(
			(
				await fetch(`${origin}/public/share/public-book/progress`, {
					method: 'PATCH',
					headers: { cookie: shareCookie, 'content-type': 'application/json' },
					body: JSON.stringify({ currentTime: 3 }),
				})
			).status,
			204,
		)
		assert.equal((await fetch(`${origin}/public/share/expired`)).status, 404)
		const denied = await fetch(`${origin}/public/share/public-book-no-download`)
		const deniedCookie = (denied.headers.get('set-cookie') || '').split(';')[0]
		assert.equal(
			(
				await fetch(`${origin}/public/share/public-book-no-download/download`, {
					headers: { cookie: deniedCookie },
				})
			).status,
			403,
		)
		const form = new FormData()
		form.set('title', 'Upload test')
		form.set('library', 'books')
		form.set('folder', 'books-folder')
		form.set(
			'file',
			new File(['Original test text'], 'test.txt', { type: 'text/plain' }),
		)
		assert.equal(
			(
				await fetch(`${origin}/api/upload`, {
					method: 'POST',
					headers: { authorization: 'Bearer fixture-admin-access' },
					body: form,
				})
			).status,
			200,
		)
		assert.equal(
			(await (await api('/api/libraries/books/search?q=Upload%20test')).json())
				.book.length,
			1,
		)
		for (const prefix of ['', '/abs']) {
			for (const [file, mime] of [
				['manifest.webmanifest', 'application/manifest+json'],
				['icons/icon.svg', 'image/svg+xml'],
				['icons/icon192.png', 'image/png'],
				['icons/icon512.png', 'image/png'],
				['icons/apple-touch-icon.png', 'image/png'],
			]) {
				const response = await fetch(`${origin}${prefix}/new/${file}`)
				const built = Bun.file(new URL(`../../dist/${file}`, import.meta.url))
				assert.equal(response.status, (await built.exists()) ? 200 : 404)
				assert.equal(response.headers.get('cache-control'), 'no-store')
				if (await built.exists()) {
					assert.equal(response.headers.get('content-type'), mime)
					assert.deepEqual(
						new Uint8Array(await response.arrayBuffer()),
						new Uint8Array(await built.arrayBuffer()),
					)
				}
			}
			assert.equal(
				(await fetch(`${origin}${prefix}/new/icons/missing.png`)).status,
				404,
			)
			assert.equal(
				(await fetch(`${origin}${prefix}/new/icons/nested%2ficon.svg`)).status,
				400,
			)
		}
		assert.equal((await api('/classic/_nuxt/not-found.js')).status, 404)
		assert.equal((await api('/classic/api/unsupported')).status, 404)
		const page = await fetch(`${origin}/classic/item/book-1`, {
			headers: { accept: 'text/html' },
		})
		assert.equal(page.status, 200)
		console.log(
			'PASS: strict auth, permissions, native GETs, progress/bookmark/collection/playlist mutations, Classic prefix/static, seven-track ranges',
		)
	}
} finally {
	child.kill()
	await child.exited
}

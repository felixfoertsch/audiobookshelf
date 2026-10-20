// Opt-in local test cache. Never runs during tests or application startup.
import { createHash } from 'node:crypto'
import { mkdir, rename, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { realRecords } from './load'
import {
	durationSchema,
	lookupSchema,
	realRecordsSchema,
	rssSchema,
	text,
} from './schema'
import { bookSource, type RealRecord, sources } from './sources'

const require = createRequire(import.meta.url)
const parseStringPromise: (xml: string) => Promise<unknown> =
	require('../../../node_modules/xml2js').parseStringPromise
const ffprobe = Bun.which('ffprobe')
if (!ffprobe) throw new Error('ffprobe executable required before downloading')
const root = new URL('../media/real/', import.meta.url)
const hosts = new Set([
	'itunes.apple.com',
	'thisislow.com',
	'audio.thisislow.com',
	'op3.dev',
	'www.omnycontent.com',
	'podtrac.com',
	'pscrb.fm',
	'traffic.omny.fm',
	'iheartmedia.mc.tritondigital.com',
	'26033.mc.tritondigital.com',
	'traffic.megaphone.fm',
	'chtbl.com',
	'librivox.org',
	'archive.org',
])
function vetted(url: string) {
	const u = new URL(url)
	if (
		u.protocol !== 'https:' ||
		u.username ||
		u.password ||
		(u.port && u.port !== '443') ||
		!(
			hosts.has(u.hostname) ||
			/^[a-z0-9-]+\.(?:us|ca)\.archive\.org$/.test(u.hostname)
		)
	)
		throw new Error(`Unapproved download host: ${u.hostname}`)
	return u
}
async function download(url: string, name: string, maxBytes: number) {
	const existing = Bun.file(new URL(name, root))
	if (
		name.endsWith('.mp3') &&
		realRecords.some((record) =>
			record.tracks.some((track) => track.file === `real/${name}`),
		) &&
		(await existing.exists()) &&
		existing.size <= maxBytes
	)
		return existing
	const signal = AbortSignal.timeout(180_000)
	let response: Response | undefined
	for (let redirect = 0; redirect < 10; redirect++) {
		response = await fetch(vetted(url), { redirect: 'manual', signal })
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location')
			await response.body?.cancel()
			if (!location) throw new Error('Redirect without Location')
			url = new URL(location, url).href
			continue
		}
		break
	}
	if (!response?.ok || !response.body)
		throw new Error(`Download failed: ${response?.status}`)
	if (Number(response.headers.get('content-length')) > maxBytes)
		throw new Error('Download exceeds byte limit')
	const partial = new URL(`${name}.partial`, root)
	const writer = Bun.file(partial).writer()
	let size = 0
	try {
		for await (const chunk of response.body) {
			size += chunk.length
			if (size > maxBytes) throw new Error('Download exceeds byte limit')
			writer.write(chunk)
		}
		await writer.end()
		await rename(partial, new URL(name, root))
	} catch (error) {
		await writer.end()
		await rm(partial, { force: true })
		throw error
	}
	return Bun.file(new URL(name, root))
}
await mkdir(root, { recursive: true })
const records: RealRecord[] = []
for (const source of [...sources, bookSource]) {
	const isPodcast = 'lookupUrl' in source
	let feedUrl: string
	if (isPodcast) {
		const lookup = lookupSchema.parse(
			await (
				await download(source.lookupUrl, `${source.id}-apple.json`, 1_000_000)
			).json(),
		)
		feedUrl = lookup.results[0].feedUrl
	} else feedUrl = source.feedUrl
	const feed = await download(feedUrl, `${source.id}.rss`, 5_000_000)
	const xml = rssSchema.parse(await parseStringPromise(await feed.text()))
	const channel = xml.rss.channel[0]
	const coverUrl = channel['itunes:image']?.[0]?.$?.href
	if (!coverUrl) throw new Error('Missing RSS cover')
	await download(coverUrl, `${source.id}.jpg`, 5_000_000)
	const record: RealRecord = {
		id: source.id,
		kind: isPodcast ? 'podcast' : 'book',
		title: isPodcast ? text(channel.title) : 'Der Antichrist',
		author: isPodcast ? text(channel['itunes:author']) : 'Friedrich Nietzsche',
		description: text(channel.description),
		language: text(channel.language),
		feedUrl,
		sourceUrl: isPodcast ? source.appleUrl : source.catalogUrl,
		cover: `real/${source.id}.jpg`,
		tracks: [],
	}
	if (!isPodcast) {
		const archive = z
			.object({
				files: z.array(
					z.object({ name: z.string(), size: z.coerce.number().optional() }),
				),
			})
			.parse(
				await (
					await download(
						'https://archive.org/metadata/antichrist_1504_librivox',
						'archive-metadata.json',
						5_000_000,
					)
				).json(),
			)
		const chapters = channel.item.map((episode) => {
			const filename = new URL(episode.enclosure[0].$.url).pathname
				.split('/')
				.pop()
			const size = archive.files.find((file) => file.name === filename)?.size
			if (!size || !Number.isSafeInteger(size) || size <= 0)
				throw new Error('Missing authoritative chapter size')
			return size
		})
		if (
			chapters.length !== 7 ||
			chapters.reduce((n, size) => n + size, 0) > 250_000_000
		)
			throw new Error('Book exceeds approved chapter/250 MB bound')
	}
	// One episode per subscription; complete seven-chapter LibriVox book under 250 MB.
	for (const [index, episode] of channel.item
		.slice(0, isPodcast ? 1 : 7)
		.entries()) {
		const enclosure = episode.enclosure?.[0]?.$
		if (!enclosure?.url || enclosure.type !== 'audio/mpeg')
			throw new Error('Unsupported enclosure')
		const name = `${source.id}-${index + 1}.mp3`
		const file = await download(enclosure.url, name, 100_000_000)
		const probe = Bun.spawn(
			[
				ffprobe,
				'-v',
				'error',
				'-show_entries',
				'format=duration',
				'-of',
				'json',
				fileURLToPath(new URL(name, root)),
			],
			{ stdout: 'pipe', timeout: 15_000, killSignal: 'SIGKILL' },
		)
		const duration = durationSchema.parse(
			await new Response(probe.stdout).json(),
		).format.duration
		if ((await probe.exited) || !Number.isFinite(duration) || duration <= 0)
			throw new Error('Invalid audio duration')
		record.tracks.push({
			id: `${source.id}-ep-${index + 1}`,
			title: text(episode.title),
			guid: text(episode.guid),
			pubDate: text(episode.pubDate),
			enclosure,
			file: `real/${name}`,
			duration,
			size: file.size,
			sha256: createHash('sha256')
				.update(new Uint8Array(await file.arrayBuffer()))
				.digest('hex'),
		})
		console.log(
			JSON.stringify({
				source: record.title,
				title: text(episode.title),
				file: name,
				size: file.size,
				duration,
			}),
		)
	}
	records.push(record)
}
await Bun.write(
	new URL('manifest.json.partial', root),
	JSON.stringify(realRecordsSchema.parse(records), null, '\t'),
)
await rename(
	new URL('manifest.json.partial', root),
	new URL('manifest.json', root),
)
console.log(
	'Local manifest saved. Restart fixture server to load subscriptions; tests remain network-free.',
)

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { items, libraries, playable } from '../e2e/data'
import { realRecords } from '../e2e/real-media/load'
import { itemSchema } from './catalog'

function wavDuration(bytes: Buffer) {
	let offset = 12
	let rate = 0
	while (offset + 8 <= bytes.length) {
		const tag = bytes.toString('ascii', offset, offset + 4)
		const size = bytes.readUInt32LE(offset + 4)
		if (tag === 'fmt ') rate = bytes.readUInt32LE(offset + 16)
		if (tag === 'data') return size / rate
		offset += 8 + size + (size % 2)
	}
	throw new Error('Invalid WAV')
}
describe('synthetic media contract', () => {
	it('optional real subscriptions keep RSS and downloaded audio contracts', () => {
		for (const record of realRecords) {
			const item = items.find((item) => item.id === record.id)
			if (!item) throw new Error(`Missing real item: ${record.id}`)
			itemSchema.parse(item)
			expect(item.media.metadata.title).toBe(record.title)
			if (record.kind === 'podcast' && 'feedUrl' in item.media.metadata)
				expect(item.media.metadata.feedUrl).toBe(record.feedUrl)
			for (const track of record.tracks) {
				expect(readFileSync(resolve('e2e/media', track.file)).length).toBe(
					track.size,
				)
				expect(track.duration).toBeGreaterThan(0)
			}
			if (record.kind === 'book' && 'tracks' in item.media)
				expect(item.media.tracks).toHaveLength(7)
		}
	})
	it('provides serializer-valid books and podcasts', () => {
		expect(libraries.length).toBeGreaterThanOrEqual(2)
		const parsed = items.map((item) => itemSchema.parse(item))
		expect(
			parsed.filter(
				(i) =>
					i.mediaType === 'book' &&
					!i.id.startsWith('real-') &&
					!i.id.startsWith('read-'),
			),
		).toHaveLength(6)
		expect(
			parsed.filter(
				(i) =>
					i.mediaType === 'podcast' &&
					!i.id.startsWith('real-') &&
					!i.id.startsWith('read-'),
			),
		).toHaveLength(6)
	})
	it('metadata matches real local and portable fallback audio duration', () => {
		for (const audio of Object.values(playable).filter(
			(audio) => audio.mimeType === 'audio/wav',
		)) {
			for (const file of [audio.file, audio.fallbackFile]) {
				const path = resolve('e2e/media', file)
				if (file.startsWith('local/') && !existsSync(path)) continue
				expect(wavDuration(readFileSync(path))).toBeCloseTo(audio.duration, 4)
			}
		}
		expect(Object.keys(playable)).toContain('book-1')
		expect(Object.keys(playable)).toContain('podcast-1-ep-1')
	})
})

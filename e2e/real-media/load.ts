import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { realRecordsSchema } from './schema'

const manifest = new URL('../media/real/manifest.json', import.meta.url)
// Missing cache is normal: portable synthetic tests must not need network.
if (existsSync(manifest) && statSync(manifest).size > 1_000_000)
	throw new Error('Oversized local real-media manifest')
export const realRecords = existsSync(manifest)
	? realRecordsSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')))
	: []
for (const record of realRecords) {
	for (const track of record.tracks) {
		const file = new URL(`../media/${track.file}`, import.meta.url)
		if (
			!existsSync(file) ||
			statSync(file).size !== track.size ||
			createHash('sha256').update(readFileSync(file)).digest('hex') !==
				track.sha256
		)
			throw new Error(`Invalid local real-media cache: ${track.file}`)
	}
}

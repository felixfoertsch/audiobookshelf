import { describe, expect, it } from 'vitest'
import { entryIdentity, shelvesSchema } from './browse-api'

const item = (episode: string) => ({
	id: 'show',
	mediaType: 'podcast',
	media: { metadata: { title: 'Show' } },
	recentEpisode: { id: episode, title: episode },
})
describe('personalized shelf identity', () => {
	it('deduplicates identical episodes without dropping distinct episodes from same show', () => {
		const [shelf] = shelvesSchema.parse([
			{
				id: 'continue-listening',
				label: 'Continue Listening',
				type: 'episode',
				entities: [item('one'), item('one'), item('two')],
			},
		])
		expect(shelf.entities.map(entryIdentity)).toEqual([
			'["show","one"]',
			'["show","two"]',
		])
	})
})

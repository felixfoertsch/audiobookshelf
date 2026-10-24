export const sources = [
	{
		id: 'real-low',
		appleUrl: 'https://podcasts.apple.com/gb/podcast/low/id6809689703',
		lookupUrl:
			'https://itunes.apple.com/lookup?id=6809689703&country=gb&entity=podcast',
	},
	{
		id: 'real-end-world',
		appleUrl:
			'https://podcasts.apple.com/fr/podcast/the-end-of-the-world-with-josh-clark/id1437682381',
		lookupUrl:
			'https://itunes.apple.com/lookup?id=1437682381&country=fr&entity=podcast',
	},
] as const
export const bookSource = {
	id: 'real-antichrist',
	catalogUrl: 'https://librivox.org/der-antichrist-by-friedrich-nietzsche/',
	feedUrl: 'https://librivox.org/rss/9696',
}
export type RealRecord = {
	id: string
	kind: 'podcast' | 'book'
	title: string
	author: string
	description: string
	language: string
	feedUrl: string
	sourceUrl: string
	cover: string
	tracks: {
		id: string
		title: string
		guid: string
		pubDate: string
		enclosure: { url: string; type: string; length: string }
		file: string
		duration: number
		size: number
		sha256: string
	}[]
}

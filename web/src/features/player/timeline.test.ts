import { describe, expect, it } from 'vitest'
import { originalTime, trackAt } from './timeline'

describe('three-track original timeline', () => {
	const tracks = [
		{ contentUrl: '/a', duration: 10, startOffset: 0 },
		{ contentUrl: '/b', duration: 20, startOffset: 10 },
		{ contentUrl: '/c', duration: 30, startOffset: 30 },
	]
	it('maps seeks across boundaries and end', () => {
		expect(trackAt(tracks, 10, 60)).toEqual({
			index: 1,
			localTime: 0,
			start: 10,
		})
		expect(trackAt(tracks, 42, 60)).toEqual({
			index: 2,
			localTime: 12,
			start: 30,
		})
		expect(trackAt(tracks, 99, 60)).toEqual({
			index: 2,
			localTime: 30,
			start: 30,
		})
		expect(originalTime(tracks, 2, 12)).toBe(42)
	})
	it('derives absent offsets from track lengths', () => {
		expect(
			trackAt(
				tracks.map(({ contentUrl, duration }) => ({ contentUrl, duration })),
				25,
				60,
			).localTime,
		).toBe(15)
	})
	it('rejects malformed timeline', () => {
		expect(() => trackAt([], 0, 60)).toThrow()
		expect(() => trackAt(tracks, Number.NaN, 60)).toThrow()
	})
})

import { describe, expect, it } from 'vitest'
import { appendUnique, seriesValues, splitNames } from './model'

describe('batch mapping', () => {
	it('trims names, preserves structured series IDs, and appends uniquely', () => {
		const series = [{ id: 'series-1', name: 'Existing' }]
		expect(splitNames(' Existing, New ,,')).toEqual(['Existing', 'New'])
		expect(seriesValues(['Existing', 'New'], series)).toEqual([
			{ id: 'series-1', name: 'Existing' },
			{ id: 'new-New', name: 'New' },
		])
		expect(appendUnique(['a'], ['a', 'b'], (x) => x)).toEqual(['a', 'b'])
	})
})

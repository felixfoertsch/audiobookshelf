import { useEffect, useState } from 'react'
import { z } from 'zod'
import { type BrowseSearch, browseSearch } from './browse-api'

export type BrowseSearchInput = z.input<typeof browseSearch>
const savedSettings = z.record(z.string(), z.unknown())
export function readCatalogSettings() {
	try {
		return savedSettings.parse(
			JSON.parse(localStorage.getItem('userSettings') || '{}'),
		)
	} catch {
		return {}
	}
}
export function writeCatalogSettings(patch: Record<string, unknown>) {
	localStorage.setItem(
		'userSettings',
		JSON.stringify({ ...readCatalogSettings(), ...patch }),
	)
}
export function preferredSearch(
	input: Record<string, unknown>,
	mode = '',
): BrowseSearch {
	const saved = readCatalogSettings()
	return browseSearch.parse({
		sort:
			mode === 'series'
				? saved.seriesSortBy || 'name'
				: mode === 'authors'
					? saved.authorSortBy || 'name'
					: saved.orderBy,
		desc: (
			mode === 'series'
				? saved.seriesSortDesc
				: mode === 'authors'
					? saved.authorSortDesc
					: saved.orderDesc
		)
			? '1'
			: '0',
		filter: mode === 'series' ? saved.seriesFilterBy : saved.filterBy,
		collapse: saved.collapseSeries ? '1' : '0',
		view: z
			.enum(['grid', 'list', 'detail'])
			.catch('grid')
			.parse(saved.modernBookshelfView),
		...input,
	})
}
export function podcastSearch(search: BrowseSearch): BrowseSearch {
	const sorts = [
		'media.metadata.title',
		'media.metadata.author',
		'addedAt',
		'size',
		'media.numTracks',
		'birthtimeMs',
		'mtimeMs',
		'random',
	]
	const filters = [
		'all',
		'genres',
		'tags',
		'languages',
		'issues',
		'feed-open',
		'explicit',
	]
	return {
		...search,
		sort: sorts.includes(search.sort) ? search.sort : 'media.metadata.title',
		filter: filters.includes(search.filter.split('.')[0])
			? search.filter
			: 'all',
		collapse: '0',
	}
}
export function persistSearch(search: BrowseSearch, mode: string) {
	writeCatalogSettings(
		mode === 'series'
			? {
					seriesSortBy: search.sort,
					seriesSortDesc: search.desc === '1',
					seriesFilterBy: search.filter,
				}
			: mode === 'authors'
				? { authorSortBy: search.sort, authorSortDesc: search.desc === '1' }
				: {
						orderBy: search.sort,
						orderDesc: search.desc === '1',
						filterBy: search.filter,
						collapseSeries: search.collapse === '1',
						modernBookshelfView: search.view,
					},
	)
}
export function useShelfPosition(key: string) {
	useEffect(() => {
		const saved = Number(sessionStorage.getItem(`abs:shelf:${key}`) || 0)
		const frame = requestAnimationFrame(() => window.scrollTo(0, saved))
		const remember = () =>
			sessionStorage.setItem(`abs:shelf:${key}`, String(window.scrollY))
		window.addEventListener('scroll', remember, { passive: true })
		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener('scroll', remember)
		}
	}, [key])
}
export function useCoverSize() {
	const [size, setSize] = useState(() => {
		const value = readCatalogSettings().bookshelfCoverSize
		return typeof value === 'number' && value >= 60 && value <= 220
			? value
			: 120
	})
	return {
		size,
		setSize: (value: number) => {
			setSize(value)
			writeCatalogSettings({ bookshelfCoverSize: value })
		},
	}
}

import { afterEach, expect, it } from 'vitest'
import { readPlayerSettings, savePlayerSetting } from './settings'

afterEach(() => localStorage.removeItem('userSettings'))
it('reuses Classic browser settings without dropping unrelated fields', () => {
	localStorage.setItem(
		'userSettings',
		JSON.stringify({ bookshelfCoverSize: 160, playbackRate: 1.25 }),
	)
	expect(readPlayerSettings().playbackRate).toBe(1.25)
	savePlayerSetting('jumpForwardAmount', 30)
	expect(JSON.parse(localStorage.getItem('userSettings') || '{}')).toEqual({
		bookshelfCoverSize: 160,
		playbackRate: 1.25,
		jumpForwardAmount: 30,
	})
	expect(() => savePlayerSetting('playbackRate', 0)).toThrow()
})

it('persists chapter timeline independently of playback sessions', () => {
	expect(readPlayerSettings().chapterTimeline ?? false).toBe(false)
	savePlayerSetting('chapterTimeline', true)
	expect(readPlayerSettings().chapterTimeline).toBe(true)
})

it('persists auto-skip independently of playback sessions', () => {
	expect(readPlayerSettings().autoSkip ?? true).toBe(true)
	savePlayerSetting('autoSkip', false)
	expect(readPlayerSettings().autoSkip).toBe(false)
})

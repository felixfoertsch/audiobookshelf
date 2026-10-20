import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EpisodeEdit } from './EpisodeEdit'

const update = vi.hoisted(() => vi.fn().mockResolvedValue({}))
vi.mock('./service', () => ({ updateEpisode: update }))
afterEach(cleanup)
it('keeps multiline draft across cancel and failure, validates UTC date', async () => {
	render(
		<EpisodeEdit
			itemId="show"
			episode={{ id: 'episode', title: 'Episode' }}
			onSaved={() => {}}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Edit episode' }))
	expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA')
	fireEvent.change(screen.getByLabelText('Description'), {
		target: { value: 'Draft\nsecond line' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
	fireEvent.click(screen.getByRole('button', { name: 'Edit episode' }))
	expect(screen.getByLabelText('Description')).toHaveProperty(
		'value',
		'Draft\nsecond line',
	)
	fireEvent.change(screen.getByLabelText('Published (UTC, YYYY-MM-DD HH:MM)'), {
		target: { value: 'invalid' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save episode' }))
	expect(screen.getByRole('alert').textContent).toBe('Invalid publication date')
	expect(update).not.toHaveBeenCalled()
	fireEvent.change(screen.getByLabelText('Published (UTC, YYYY-MM-DD HH:MM)'), {
		target: { value: '2026-10-20 15:30' },
	})
	update.mockRejectedValueOnce(new Error('Fixture failure'))
	fireEvent.click(screen.getByRole('button', { name: 'Save episode' }))
	await waitFor(() =>
		expect(screen.getByRole('alert').textContent).toBe('Fixture failure'),
	)
	expect(screen.getByLabelText('Description')).toHaveProperty(
		'value',
		'Draft\nsecond line',
	)
	expect(update).toHaveBeenCalledWith(
		'show',
		'episode',
		expect.objectContaining({ publishedAt: Date.parse('2026-10-20T15:30Z') }),
	)
})

it('rebases pristine and saved drafts to refreshed canonical episode', async () => {
	const props = {
		itemId: 'show',
		episode: { id: 'episode', title: 'Old title' },
		onSaved: vi.fn(),
		drafts: new Map<string, Record<string, string>>(),
	}
	const view = render(<EpisodeEdit {...props} />)
	view.rerender(
		<EpisodeEdit
			{...props}
			episode={{ ...props.episode, title: 'Refreshed title' }}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Edit episode' }))
	expect(screen.getByLabelText('Title')).toHaveProperty(
		'value',
		'Refreshed title',
	)
	fireEvent.change(screen.getByLabelText('Title'), {
		target: { value: 'Submitted title' },
	})
	fireEvent.click(screen.getByRole('button', { name: 'Save episode' }))
	await waitFor(() => expect(props.onSaved).toHaveBeenCalled())
	expect(props.drafts.size).toBe(0)
	view.rerender(
		<EpisodeEdit
			{...props}
			episode={{ ...props.episode, title: 'Server normalized title' }}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Edit episode' }))
	expect(screen.getByLabelText('Title')).toHaveProperty(
		'value',
		'Server normalized title',
	)
})

it('restores unsaved draft after episode row unmount and Escape', async () => {
	const props = {
		itemId: 'show',
		episode: { id: 'episode', title: 'Canonical' },
		onSaved: vi.fn(),
		drafts: new Map<string, Record<string, string>>(),
	}
	const view = render(<EpisodeEdit {...props} />)
	fireEvent.click(screen.getByRole('button', { name: 'Edit episode' }))
	fireEvent.change(screen.getByLabelText('Title'), {
		target: { value: 'Unsaved title' },
	})
	fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' })
	await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
	view.unmount()
	render(
		<EpisodeEdit
			{...props}
			episode={{ ...props.episode, title: 'External title' }}
		/>,
	)
	fireEvent.click(screen.getByRole('button', { name: 'Edit episode' }))
	expect(screen.getByLabelText('Title')).toHaveProperty(
		'value',
		'Unsaved title',
	)
})

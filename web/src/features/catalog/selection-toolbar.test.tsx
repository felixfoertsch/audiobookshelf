import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { SelectionToolbar } from './selection-toolbar'

afterEach(cleanup)

test('selection toolbar exposes count, page, clear, Done and dropdown bulk actions', async () => {
	const selectAll = vi.fn()
	const clear = vi.fn()
	const done = vi.fn()
	const mark = vi.fn()
	render(
		<SelectionToolbar
			count={2}
			selectAll={selectAll}
			clear={clear}
			done={done}
			pending={false}
			podcast={false}
			mark={mark}
			play={vi.fn()}
		>
			{null}
		</SelectionToolbar>,
	)
	expect(screen.getByRole('status').textContent).toBe('2 selected')
	fireEvent.click(screen.getByRole('button', { name: 'Select page' }))
	fireEvent.click(screen.getByRole('button', { name: 'Clear selection (2)' }))
	fireEvent.click(screen.getByRole('button', { name: 'Done' }))
	expect(selectAll).toHaveBeenCalledOnce()
	expect(clear).toHaveBeenCalledOnce()
	expect(done).toHaveBeenCalledOnce()
	fireEvent.keyDown(screen.getByRole('button', { name: 'Bulk actions' }), {
		key: 'Enter',
	})
	fireEvent.click(
		await screen.findByRole('menuitem', { name: /^Mark finished$/ }),
	)
	expect(mark).toHaveBeenCalledWith(true)
})

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from 'react-aria-components'
import { afterEach, expect, it, vi } from 'vitest'
import { IsoDateTimeField } from './IsoDateTimeField'

afterEach(cleanup)
for (const locale of ['en-US', 'de-DE', 'ar-EG']) {
	it(`shows ISO order and 24h digits under ${locale}`, () => {
		const change = vi.fn()
		render(
			<I18nProvider locale={locale}>
				<IsoDateTimeField
					label="After"
					value="2026-10-20T17:45"
					onChange={change}
				/>
			</I18nProvider>,
		)
		const fields = screen.getAllByRole('spinbutton')
		expect(fields.map((field) => field.textContent)).toEqual([
			'2026',
			'10',
			'20',
			'17',
			'45',
		])
		expect(screen.getByRole('group').textContent).toContain('2026-10-20 17:45')
		fireEvent.keyDown(fields[4], { key: 'ArrowUp' })
		expect(change).toHaveBeenCalledWith('2026-10-20T17:46')
	})
}
it('accepts empty value and disabled state', () => {
	render(
		<IsoDateTimeField label="After" value="" isDisabled onChange={vi.fn()} />,
	)
	expect(
		screen
			.getAllByRole('spinbutton')
			.every((field) => field.getAttribute('aria-disabled') === 'true'),
	).toBe(true)
})

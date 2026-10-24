import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { RichText } from './RichText'

afterEach(cleanup)
it('keeps semantic blocks, entities, nested lists and safe links', () => {
	const { container } = render(
		<RichText
			text={
				'<p>Hello &amp; goodbye</p><ul><li><strong>Nested</strong><ul><li>Child</li></ul></li></ul><a href="https://example.test/long">Link</a>'
			}
		/>,
	)
	expect(container.querySelector('p')?.textContent).toBe('Hello & goodbye')
	expect(screen.getAllByRole('list')).toHaveLength(2)
	expect(screen.getByRole('link').getAttribute('href')).toBe(
		'https://example.test/long',
	)
})
it('drops active markup and attributes and rejects unsafe URLs', () => {
	const { container } = render(
		<RichText
			text={
				'<script>alert(1)</script><style>body{display:none}</style><iframe src="/hostile"></iframe><object data="/hostile"></object><svg><a href="https://evil.test">evil</a></svg><math>evil</math><img src="/hostile" onerror="alert(1)"><p onclick="alert(1)">Safe</p><a href="javascript:alert(1)">JS</a><a href="data:text/html,evil">Data</a><a href="&#106;avascript:alert(1)">Entity</a>'
			}
		/>,
	)
	expect(
		container.querySelector(
			'script,style,iframe,object,svg,math,img,[onclick],[onerror],a[href]',
		),
	).toBeNull()
	expect(container.textContent).toBe('SafeJSDataEntity')
})
it('preserves plain newlines and long unbroken text without adding unsafe elements', () => {
	const text = `Line one\nLine two\nhttps://example.test/${'x'.repeat(1000)}`
	const { container } = render(<RichText text={text} />)
	expect(container.textContent).toBe(text)
	expect(container.firstElementChild?.className).toContain(
		'[overflow-wrap:anywhere]',
	)
})

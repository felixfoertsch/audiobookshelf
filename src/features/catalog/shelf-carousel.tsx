import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Button } from '../../shared/components/ui/button'

export function ShelfCarousel({
	label,
	heading,
	hero,
	children,
}: {
	label: string
	heading?: ReactNode
	hero: boolean
	children: ReactNode
}) {
	const ref = useRef<HTMLElement>(null)
	const [ends, setEnds] = useState({ start: true, end: true, overflow: false })
	// biome-ignore lint/correctness/useExhaustiveDependencies: New shelf content can change scrollWidth without resizing its viewport.
	useEffect(() => {
		const el = ref.current
		if (!el) return
		const update = () =>
			setEnds({
				overflow: el.scrollWidth > el.clientWidth,
				start: el.scrollLeft <= 1,
				end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
			})
		update()
		const observer = new ResizeObserver(update)
		observer.observe(el)
		el.addEventListener('scroll', update)
		window.addEventListener('resize', update)
		return () => {
			observer.disconnect()
			window.removeEventListener('resize', update)
			el.removeEventListener('scroll', update)
		}
	}, [children])
	return (
		<div className="relative">
			<div className="mb-3 flex items-center justify-between gap-4">
				{heading}
				{ends.overflow && (
					<div className="ml-auto flex gap-1 [@media(pointer:coarse)]:hidden">
						{([-1, 1] as const).map((direction) => (
							<Button
								key={direction}
								variant="ghost"
								size="icon"
								aria-label={`${direction < 0 ? 'Previous' : 'Next'} ${label}`}
								disabled={direction < 0 ? ends.start : ends.end}
								onClick={() => {
									const el = ref.current
									el?.scrollBy({
										left: direction * el.clientWidth,
										behavior: 'smooth',
									})
								}}
							>
								{direction < 0 ? <ChevronLeft /> : <ChevronRight />}
							</Button>
						))}
					</div>
				)}
			</div>
			<section
				ref={ref}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Scroll region must support keyboard scrolling, including swipe-only devices.
				tabIndex={0}
				aria-label={label}
				className={`flex w-screen -ml-[calc(var(--shelf-sidebar)+var(--shelf-gutter))] snap-x snap-mandatory gap-4 overflow-x-auto pl-[calc(var(--shelf-sidebar)+var(--shelf-gutter))] pr-[var(--shelf-gutter)] scroll-pl-[calc(var(--shelf-sidebar)+var(--shelf-gutter))] scroll-pr-[var(--shelf-gutter)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>article]:shrink-0 [&>article]:snap-start ${hero ? '[&>article]:w-[240px] sm:[&>article]:w-[280px]' : '[&>article]:w-[140px] sm:[&>article]:w-[160px]'}`}
			>
				{children}
			</section>
		</div>
	)
}

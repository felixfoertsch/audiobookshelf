import { type ReactNode, useEffect, useRef, useState } from 'react'
import { RichText } from '../../shared/components/RichText'

export function EpisodeDescription({ text }: { text: string }) {
	const content = useRef<HTMLDivElement>(null)
	const [overflow, setOverflow] = useState(false)
	const [open, setOpen] = useState(false)
	useEffect(() => {
		const element = content.current
		if (!element || open || !text) return
		const measure = () =>
			setOverflow(element.scrollHeight > element.clientHeight + 1)
		measure()
		if (typeof ResizeObserver === 'undefined') return
		const observer = new ResizeObserver(measure)
		observer.observe(element)
		return () => observer.disconnect()
	}, [text, open])
	return (
		<div className="mt-2">
			<div
				ref={content}
				className={
					open ? 'text-sm' : 'line-clamp-2 text-sm text-muted-foreground'
				}
			>
				<RichText text={text} />
			</div>
			{overflow && (
				<button
					type="button"
					className="min-h-11 text-sm text-primary"
					aria-expanded={open}
					onClick={() => setOpen(!open)}
				>
					{open ? 'Read less' : 'Read description'}
				</button>
			)}
		</div>
	)
}

export function EpisodeRow({
	image,
	children,
	actions,
}: {
	image?: ReactNode
	children: ReactNode
	actions?: ReactNode
}) {
	return (
		<li className="flex min-w-0 gap-4 py-5 [overflow-wrap:anywhere]">
			{image}
			<div className="min-w-0 flex-1">
				{children}
				{actions && (
					<div className="mt-2 flex flex-wrap items-center gap-2">
						{actions}
					</div>
				)}
			</div>
		</li>
	)
}

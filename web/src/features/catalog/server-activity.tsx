import { useEffect, useState } from 'react'
import { z } from 'zod'
import serverPackage from '../../../../package.json'
import { useAuth } from '../../api'

const onlineUser = z.object({ id: z.string(), username: z.string() })
const taskSchema = z.object({
	id: z.string(),
	title: z.string().nullish(),
	action: z.string().nullish(),
	description: z.string().nullish(),
	error: z.string().nullish(),
	isFinished: z.boolean().optional(),
	isFailed: z.boolean().optional(),
})
export function ServerActivity() {
	const user = useAuth((state) => state.user)
	const source = useAuth((state) => state.bootstrap?.Source)
	const [online, setOnline] = useState<z.infer<typeof onlineUser>[] | null>(
		null,
	)
	const [tasks, setTasks] = useState<z.infer<typeof taskSchema>[]>([])
	const admin = user?.type === 'root' || user?.type === 'admin'
	useEffect(() => {
		setOnline(null)
		setTasks([])
		const receive = (event: Event) => {
			if (useAuth.getState().user !== user) return
			const data = z
				.object({ event: z.string(), payload: z.unknown() })
				.safeParse((event as CustomEvent).detail)
			if (!data.success) return
			const { event: name, payload } = data.data
			if (name === 'reconnect' || name === 'disconnect') {
				setOnline(null)
				setTasks([])
			}
			if (name === 'init') {
				const result = z
					.object({ usersOnline: z.array(onlineUser).optional() })
					.safeParse(payload)
				if (result.success) setOnline(result.data.usersOnline || null)
			}
			if (
				admin &&
				['user_online', 'user_stream', 'user_offline'].includes(name)
			) {
				const result = onlineUser.safeParse(payload)
				if (result.success)
					setOnline((previous) =>
						previous === null
							? null
							: [
									...previous.filter((entry) => entry.id !== result.data.id),
									...(name === 'user_offline' ? [] : [result.data]),
								],
					)
			}
			if (name === 'task_started' || name === 'task_finished') {
				const result = taskSchema.safeParse(payload)
				if (result.success)
					setTasks((previous) => [
						...previous.filter((task) => task.id !== result.data.id),
						result.data,
					])
			}
		}
		window.addEventListener('abs:socket', receive)
		return () => window.removeEventListener('abs:socket', receive)
	}, [user, admin])
	return (
		<details className="rounded border p-2">
			<summary>Server activity · v{serverPackage.version}</summary>
			<div className="space-y-2 p-2">
				{source && <p>Source: {source}</p>}
				<a
					href="https://github.com/advplyr/audiobookshelf"
					target="_blank"
					rel="noreferrer"
					className="underline"
				>
					Source code
				</a>
				{' · '}
				<a
					href={`https://github.com/advplyr/audiobookshelf/releases/tag/v${serverPackage.version}`}
					target="_blank"
					rel="noreferrer"
					className="underline"
				>
					Changelog
				</a>
				{admin && (
					<section>
						<h2>Online users</h2>
						{online === null ? (
							<p>Waiting for server snapshot</p>
						) : (
							<>
								<p>{online.length} online</p>
								<ul>
									{online.map((entry) => (
										<li key={entry.id}>{entry.username}</li>
									))}
								</ul>
							</>
						)}
					</section>
				)}
				<section aria-live="polite">
					<h2>Tasks observed this session</h2>
					{tasks.length === 0 ? (
						<p>No task events received</p>
					) : (
						<ul>
							{tasks.map((task) => (
								<li key={task.id}>
									{task.title || task.action || 'Task'} ·{' '}
									{task.isFailed
										? 'Failed'
										: task.isFinished
											? 'Finished'
											: 'Running'}
									{task.description && <p>{task.description}</p>}
									{task.error && <p role="alert">{task.error}</p>}
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</details>
	)
}

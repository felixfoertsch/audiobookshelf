export function appendUnique<T>(
	existing: T[],
	added: T[],
	key: (item: T) => string,
): T[] {
	const result = [...existing]
	for (const value of added)
		if (!result.some((current) => key(current) === key(value)))
			result.push(value)
	return result
}
export function splitNames(value: string): string[] {
	return value
		.split(',')
		.map((name) => name.trim())
		.filter(Boolean)
}
export function seriesValues(
	names: string[],
	existing: { id: string; name: string }[],
) {
	return names.map(
		(name) =>
			existing.find(
				(item) => item.name.toLowerCase() === name.toLowerCase(),
			) ?? { id: `new-${name}`, name },
	)
}

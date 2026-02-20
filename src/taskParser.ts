import { App, CachedMetadata, HeadingCache, TFile } from "obsidian";

export interface Task {
	text: string;
	line: number;
	completed: boolean;
	indent: number;
	children: Task[];
}

export interface TaskGroup {
	heading: string;
	headingLine: number;
	openTasks: Task[];
	completedTasks: Task[];
	openCount: number;
	completedCount: number;
}

export interface ParseResult {
	groups: TaskGroup[];
	totalOpen: number;
	totalCompleted: number;
}

/**
 * Find the heading that a given line falls under using binary search.
 * Headings must be sorted by line number (which they are from the cache).
 */
function findParentHeading(
	line: number,
	headings: HeadingCache[]
): { text: string; line: number } | null {
	if (headings.length === 0) return null;

	let lo = 0;
	let hi = headings.length - 1;

	// Binary search for the last heading at or before `line`
	if (headings[0]!.position.start.line > line) return null;

	while (lo < hi) {
		const mid = Math.ceil((lo + hi + 1) / 2);
		if (headings[mid]!.position.start.line <= line) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}

	const heading = headings[lo]!;
	return { text: heading.heading, line: heading.position.start.line };
}

/**
 * Build a tree of tasks from a flat list, connecting children to parents
 * via indentation. Separates open and completed tasks in a single pass.
 */
function buildGroupTasks(flatTasks: Task[]): {
	openTasks: Task[];
	completedTasks: Task[];
	openCount: number;
	completedCount: number;
} {
	const roots: Task[] = [];
	const stack: Task[] = [];

	for (const task of flatTasks) {
		while (stack.length > 0 && stack[stack.length - 1]!.indent >= task.indent) {
			stack.pop();
		}

		if (stack.length > 0) {
			stack[stack.length - 1]!.children.push(task);
		} else {
			roots.push(task);
		}
		stack.push(task);
	}

	// Single-pass partition into open/completed with counts
	const openTasks: Task[] = [];
	const completedTasks: Task[] = [];
	let openCount = 0;
	let completedCount = 0;

	function walk(tasks: Task[]): void {
		for (const task of tasks) {
			if (task.completed) {
				completedCount++;
			} else {
				openCount++;
			}
			walk(task.children);
		}
	}

	for (const task of roots) {
		if (task.completed) {
			completedTasks.push(task);
		} else {
			openTasks.push(task);
		}
	}

	// Count including nested children
	walk(roots);

	return { openTasks, completedTasks, openCount, completedCount };
}

/**
 * Parse all tasks from a file using the metadata cache and file content.
 * Returns groups pre-split into open/completed with counts.
 */
export async function parseTasks(app: App, file: TFile): Promise<ParseResult> {
	const cache: CachedMetadata | null = app.metadataCache.getFileCache(file);
	if (!cache?.listItems) {
		return { groups: [], totalOpen: 0, totalCompleted: 0 };
	}

	const content = await app.vault.cachedRead(file);
	const lines = content.split("\n");
	const headings = cache.headings ?? [];

	// Collect raw task data
	const NO_HEADING = "(No heading)";
	const groupMap = new Map<string, { headingLine: number; tasks: Task[] }>();

	for (const item of cache.listItems) {
		if (item.task === undefined) continue;

		const lineNum = item.position.start.line;
		const lineText = lines[lineNum];
		if (lineText === undefined) continue;

		const taskText = lineText.replace(/^\s*[-*+]\s*\[.\]\s*/, "").trim();
		if (!taskText) continue;

		const task: Task = {
			text: taskText,
			line: lineNum,
			completed: item.task !== " ",
			indent: item.position.start.col,
			children: [],
		};

		const heading = findParentHeading(lineNum, headings);
		const groupKey = heading ? heading.text : NO_HEADING;
		const headingLine = heading ? heading.line : -1;

		let group = groupMap.get(groupKey);
		if (!group) {
			group = { headingLine, tasks: [] };
			groupMap.set(groupKey, group);
		}
		group.tasks.push(task);
	}

	// Build groups with pre-computed open/completed splits
	let totalOpen = 0;
	let totalCompleted = 0;
	const groups: TaskGroup[] = [];

	for (const [heading, data] of groupMap) {
		const result = buildGroupTasks(data.tasks);
		totalOpen += result.openCount;
		totalCompleted += result.completedCount;

		groups.push({
			heading,
			headingLine: data.headingLine,
			...result,
		});
	}

	groups.sort((a, b) => a.headingLine - b.headingLine);

	return { groups, totalOpen, totalCompleted };
}

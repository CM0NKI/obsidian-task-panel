import { App, CachedMetadata, HeadingCache, ListItemCache, TFile } from "obsidian";

export interface Task {
	text: string;
	line: number;
	completed: boolean;
	indent: number;
	parent: number;
	children: Task[];
}

export interface TaskGroup {
	heading: string;
	headingLine: number;
	tasks: Task[];
}

/**
 * Find the heading that a given line falls under.
 * Returns the heading text and line number, or null if no heading precedes the line.
 */
function findParentHeading(
	line: number,
	headings: HeadingCache[]
): { text: string; line: number } | null {
	let result: { text: string; line: number } | null = null;
	for (const heading of headings) {
		if (heading.position.start.line <= line) {
			result = { text: heading.heading, line: heading.position.start.line };
		} else {
			break;
		}
	}
	return result;
}

/**
 * Build a tree of tasks from a flat list, connecting children to parents via indentation.
 */
function buildTaskTree(flatTasks: Task[]): Task[] {
	const roots: Task[] = [];
	const stack: Task[] = [];

	for (const task of flatTasks) {
		// Pop stack until we find a parent with less indentation
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

	return roots;
}

/**
 * Parse all tasks from a file using the metadata cache and file content.
 */
export async function parseTasks(
	app: App,
	file: TFile
): Promise<TaskGroup[]> {
	const cache: CachedMetadata | null = app.metadataCache.getFileCache(file);
	if (!cache?.listItems) {
		return [];
	}

	const content = await app.vault.cachedRead(file);
	const lines = content.split("\n");
	const headings = cache.headings ?? [];
	const listItems = cache.listItems;

	// Extract only task items (those with a checkbox)
	const tasks: Task[] = [];
	for (const item of listItems) {
		if (item.task === undefined) continue;

		const lineNum = item.position.start.line;
		const lineText = lines[lineNum];
		if (lineText === undefined) continue;

		// Extract task text by stripping the checkbox prefix
		const taskText = lineText.replace(/^\s*[-*+]\s*\[.\]\s*/, "").trim();
		if (!taskText) continue;

		// Calculate indent level from the column position
		const indent = item.position.start.col;

		tasks.push({
			text: taskText,
			line: lineNum,
			completed: item.task !== " ",
			indent,
			parent: item.parent,
			children: [],
		});
	}

	// Group tasks by heading
	const groupMap = new Map<string, { headingLine: number; tasks: Task[] }>();
	const NO_HEADING = "(No heading)";

	for (const task of tasks) {
		const heading = findParentHeading(task.line, headings);
		const groupKey = heading ? heading.text : NO_HEADING;
		const headingLine = heading ? heading.line : -1;

		if (!groupMap.has(groupKey)) {
			groupMap.set(groupKey, { headingLine, tasks: [] });
		}
		groupMap.get(groupKey)!.tasks.push(task);
	}

	// Convert map to array, preserving file order
	const groups: TaskGroup[] = [];
	for (const [heading, data] of groupMap) {
		groups.push({
			heading,
			headingLine: data.headingLine,
			tasks: buildTaskTree(data.tasks),
		});
	}

	// Sort groups by their heading position in the file
	groups.sort((a, b) => a.headingLine - b.headingLine);

	return groups;
}

/**
 * Flatten a task tree (including children) into a single array for counting.
 */
export function countTasks(groups: TaskGroup[], includeCompleted: boolean): number {
	let count = 0;

	function walk(tasks: Task[]): void {
		for (const task of tasks) {
			if (!task.completed || includeCompleted) {
				count++;
			}
			walk(task.children);
		}
	}

	for (const group of groups) {
		walk(group.tasks);
	}
	return count;
}

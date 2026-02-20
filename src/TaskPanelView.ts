import { ItemView, MarkdownView, TFile, WorkspaceLeaf, debounce } from "obsidian";
import type TaskPanelPlugin from "./main";
import { Task, TaskGroup, countTasks, parseTasks } from "./taskParser";

export const VIEW_TYPE_TASK_PANEL = "task-panel-view";

export class TaskPanelView extends ItemView {
	plugin: TaskPanelPlugin;
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TaskPanelPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_TASK_PANEL;
	}

	getDisplayText(): string {
		return "Tasks";
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				this.onFileOpen(file);
			})
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.currentFile && file.path === this.currentFile.path) {
					this.debouncedRefresh();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					this.currentFile &&
					file instanceof TFile &&
					file.path === this.currentFile.path
				) {
					this.debouncedRefresh();
				}
			})
		);

		// Initial render
		const activeFile = this.app.workspace.getActiveFile();
		this.onFileOpen(activeFile);
	}

	/**
	 * Public method for external callers (e.g. settings changes) to re-render
	 * without re-registering event listeners.
	 */
	redraw(): void {
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private onFileOpen(file: TFile | null): void {
		this.currentFile = file;
		this.refresh();
	}

	private debouncedRefresh = debounce(() => {
		this.refresh();
	}, 300, true);

	private async refresh(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("task-panel-container");

		if (!this.currentFile) {
			this.renderEmpty("No active note");
			return;
		}

		if (this.currentFile.extension !== "md") {
			this.renderEmpty("Not a markdown file");
			return;
		}

		const groups = await parseTasks(this.app, this.currentFile);
		const { showCompleted, groupByHeading } = this.plugin.settings;

		const openCount = countTasks(groups, false);

		if (openCount === 0 && !showCompleted) {
			this.renderEmpty("No open tasks");
			return;
		}

		const listContainer = container.createDiv({ cls: "task-panel-list" });

		if (groupByHeading) {
			this.renderGrouped(listContainer, groups, showCompleted);
		} else {
			this.renderFlat(listContainer, groups, showCompleted);
		}
	}

	private renderEmpty(message: string): void {
		this.contentEl.createDiv({
			cls: "task-panel-empty",
			text: message,
		});
	}

	private renderGrouped(
		container: HTMLElement,
		groups: TaskGroup[],
		showCompleted: boolean
	): void {
		for (const group of groups) {
			const openTasks = this.filterTasks(group.tasks, false);
			const completedTasks = showCompleted
				? this.filterTasks(group.tasks, true)
				: [];

			if (openTasks.length === 0 && completedTasks.length === 0) continue;

			const details = container.createEl("details", { cls: "task-panel-group" });
			details.setAttribute("open", "");

			const summary = details.createEl("summary", { cls: "task-panel-group-heading" });
			summary.createSpan({ text: group.heading, cls: "task-panel-heading-text" });

			const taskList = details.createDiv({ cls: "task-panel-task-list" });
			for (const task of openTasks) {
				this.renderTask(taskList, task, 0);
			}

			for (const task of completedTasks) {
				this.renderTask(taskList, task, 0);
			}
		}
	}

	private renderFlat(
		container: HTMLElement,
		groups: TaskGroup[],
		showCompleted: boolean
	): void {
		const allOpen: Task[] = [];
		const allCompleted: Task[] = [];
		for (const group of groups) {
			allOpen.push(...this.filterTasks(group.tasks, false));
			if (showCompleted) {
				allCompleted.push(...this.filterTasks(group.tasks, true));
			}
		}

		const taskList = container.createDiv({ cls: "task-panel-task-list" });
		for (const task of allOpen) {
			this.renderTask(taskList, task, 0);
		}

		for (const task of allCompleted) {
			this.renderTask(taskList, task, 0);
		}
	}

	private renderTask(container: HTMLElement, task: Task, depth: number): void {
		const row = container.createDiv({ cls: "task-panel-task-row" });
		if (depth > 0) {
			row.style.paddingLeft = `${depth * 20}px`;
		}
		if (task.completed) {
			row.addClass("task-panel-completed");
		}

		const checkbox = row.createEl("input", {
			attr: { type: "checkbox" },
		});
		checkbox.checked = task.completed;
		checkbox.addClass("task-list-item-checkbox");
		checkbox.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleTask(task);
		});

		const textEl = row.createSpan({ cls: "task-panel-task-text" });
		this.renderTaskText(textEl, task.text);

		row.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			// Don't navigate when clicking the checkbox or a link
			if (target === checkbox || target.closest("a")) return;
			this.scrollToTask(task);
		});

		// Render children recursively
		for (const child of task.children) {
			this.renderTask(container, child, depth + 1);
		}
	}

	/**
	 * Render task text as plain text with clickable internal/external links.
	 * Strips markdown formatting (highlights, bold, italic, etc.).
	 */
	private renderTaskText(container: HTMLElement, text: string): void {
		// Pattern to match [[internal links]] and [external links](url)
		const linkPattern = /\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([^)]+)\)/g;

		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = linkPattern.exec(text)) !== null) {
			// Add plain text before the link (stripped of markdown)
			if (match.index > lastIndex) {
				container.appendText(this.stripMarkdown(text.slice(lastIndex, match.index)));
			}

			if (match[1] !== undefined) {
				// Internal link: [[target]] or [[target|alias]]
				const parts = match[1].split("|");
				const target = parts[0]!;
				const alias = parts[1] ?? target;

				const link = container.createEl("a", {
					cls: "internal-link",
					text: alias,
				});
				link.addEventListener("click", (e) => {
					e.stopPropagation();
					this.app.workspace.openLinkText(target, this.currentFile?.path ?? "");
				});
			} else if (match[2] !== undefined && match[3] !== undefined) {
				// External link: [text](url)
				const link = container.createEl("a", {
					cls: "external-link",
					text: match[2],
					href: match[3],
				});
				link.setAttr("target", "_blank");
				link.setAttr("rel", "noopener");
				link.addEventListener("click", (e) => {
					e.stopPropagation();
				});
			}

			lastIndex = match.index + match[0].length;
		}

		// Add remaining plain text
		if (lastIndex < text.length) {
			container.appendText(this.stripMarkdown(text.slice(lastIndex)));
		}
	}

	/**
	 * Strip inline markdown formatting, keeping just the text content.
	 */
	private stripMarkdown(text: string): string {
		return text
			.replace(/==([^=]+)==/g, "$1")       // ==highlights==
			.replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold**
			.replace(/__([^_]+)__/g, "$1")        // __bold__
			.replace(/\*([^*]+)\*/g, "$1")        // *italic*
			.replace(/_([^_]+)_/g, "$1")          // _italic_
			.replace(/~~([^~]+)~~/g, "$1")        // ~~strikethrough~~
			.replace(/`([^`]+)`/g, "$1");         // `code`
	}

	private async toggleTask(task: Task): Promise<void> {
		if (!this.currentFile) return;

		const content = await this.app.vault.read(this.currentFile);
		const lines = content.split("\n");
		const line = lines[task.line];
		if (line === undefined) return;

		let newLine: string;
		if (task.completed) {
			// Uncheck: replace [x] or [X] with [ ]
			newLine = line.replace(/\[.\]/, "[ ]");
		} else {
			// Check: replace [ ] with [x]
			newLine = line.replace(/\[ \]/, "[x]");
		}

		lines[task.line] = newLine;
		await this.app.vault.modify(this.currentFile, lines.join("\n"));
	}

	private scrollToTask(task: Task): void {
		if (!this.currentFile) return;

		// Find the markdown leaf for the current file — can't use getActiveViewOfType
		// because clicking the panel makes it the active leaf.
		const leaves = this.app.workspace.getLeavesOfType("markdown");
		let target: MarkdownView | null = null;
		for (const leaf of leaves) {
			if (
				leaf.view instanceof MarkdownView &&
				leaf.view.file?.path === this.currentFile.path
			) {
				target = leaf.view;
				break;
			}
		}

		if (!target) return;

		// Focus the editor leaf first, then scroll
		this.app.workspace.revealLeaf(target.leaf);

		const editor = target.editor;
		editor.setCursor({ line: task.line, ch: 0 });

		// Scroll the task to the center of the editor
		const editorEl = (editor as unknown as { cm: { scrollDOM: HTMLElement } }).cm?.scrollDOM;
		if (editorEl) {
			// Use requestAnimationFrame to let the cursor settle before scrolling
			requestAnimationFrame(() => {
				const cursorEl = editorEl.querySelector(".cm-cursor, .cm-activeLine");
				if (cursorEl) {
					cursorEl.scrollIntoView({ block: "center", behavior: "smooth" });
				} else {
					editor.scrollIntoView(
						{ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } },
						true
					);
				}
				this.flashLine(editorEl, task.line);
			});
		} else {
			editor.scrollIntoView(
				{ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } },
				true
			);
			if (editorEl) {
				this.flashLine(editorEl, task.line);
			}
		}
	}

	/**
	 * Temporarily highlight a line in the editor with a background flash.
	 */
	private flashLine(editorEl: HTMLElement, line: number): void {
		// Find all .cm-line elements and pick the one at the target line
		const cmContent = editorEl.querySelector(".cm-content");
		if (!cmContent) return;

		const lineElements = cmContent.querySelectorAll(".cm-line");
		// cm-line elements correspond to visible lines; find the one with the active class
		const activeLine = editorEl.querySelector(".cm-active.cm-line") as HTMLElement | null;
		if (!activeLine) return;

		activeLine.addClass("task-panel-flash");
		setTimeout(() => {
			activeLine.removeClass("task-panel-flash");
		}, 1500);
	}

	/**
	 * Filter tasks, collecting from both root and children.
	 * Returns a flat list of matching tasks (completed or open).
	 */
	private filterTasks(tasks: Task[], completed: boolean): Task[] {
		const result: Task[] = [];

		function walk(taskList: Task[]): void {
			for (const task of taskList) {
				if (task.completed === completed) {
					result.push(task);
				}
				walk(task.children);
			}
		}

		walk(tasks);
		return result;
	}

}

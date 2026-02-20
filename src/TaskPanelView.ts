import { ItemView, MarkdownRenderer, MarkdownView, TFile, WorkspaceLeaf, debounce } from "obsidian";
import type TaskPanelPlugin from "./main";
import { Task, TaskGroup, parseTasks } from "./taskParser";

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
				this.currentFile = file;
				this.refresh();
			})
		);

		// metadataCache 'changed' is sufficient — it fires after the file is
		// parsed and cachedRead already returns the latest content.
		// No need to also listen to vault 'modify'.
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.currentFile && file.path === this.currentFile.path) {
					this.debouncedRefresh();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (this.currentFile && oldPath === this.currentFile.path && file instanceof TFile) {
					this.currentFile = file;
					this.refresh();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.currentFile && file.path === this.currentFile.path) {
					this.currentFile = null;
					this.refresh();
				}
			})
		);

		this.currentFile = this.app.workspace.getActiveFile();
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Re-render without re-registering event listeners. */
	redraw(): void {
		this.refresh();
	}

	// -- Refresh / render ------------------------------------------------

	private debouncedRefresh = debounce(() => this.refresh(), 300, true);

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

		const { groups, totalOpen } = await parseTasks(this.app, this.currentFile);
		const { showCompleted, groupByHeading } = this.plugin.settings;

		if (totalOpen === 0 && !showCompleted) {
			this.renderEmpty("No open tasks");
			return;
		}

		const list = container.createDiv({ cls: "task-panel-list" });

		if (groupByHeading) {
			this.renderGrouped(list, groups, showCompleted);
		} else {
			this.renderFlat(list, groups, showCompleted);
		}
	}

	private renderEmpty(message: string): void {
		this.contentEl.createDiv({ cls: "task-panel-empty", text: message });
	}

	private renderGrouped(
		container: HTMLElement,
		groups: TaskGroup[],
		showCompleted: boolean
	): void {
		for (const group of groups) {
			if (group.openCount === 0 && (!showCompleted || group.completedCount === 0)) continue;

			const details = container.createEl("details", { cls: "task-panel-group" });
			details.setAttribute("open", "");

			const summary = details.createEl("summary", { cls: "task-panel-group-heading" });
			summary.createSpan({ text: group.heading, cls: "task-panel-heading-text" });

			const taskList = details.createDiv({ cls: "task-panel-task-list" });
			this.renderTaskList(taskList, group.openTasks, 0);

			if (showCompleted) {
				this.renderTaskList(taskList, group.completedTasks, 0);
			}
		}
	}

	private renderFlat(
		container: HTMLElement,
		groups: TaskGroup[],
		showCompleted: boolean
	): void {
		const taskList = container.createDiv({ cls: "task-panel-task-list" });
		for (const group of groups) {
			this.renderTaskList(taskList, group.openTasks, 0);
		}
		if (showCompleted) {
			for (const group of groups) {
				this.renderTaskList(taskList, group.completedTasks, 0);
			}
		}
	}

	private renderTaskList(container: HTMLElement, tasks: Task[], depth: number): void {
		for (const task of tasks) {
			this.renderTask(container, task, depth);
			this.renderTaskList(container, task.children, depth + 1);
		}
	}

	// -- Single task row -------------------------------------------------

	private renderTask(container: HTMLElement, task: Task, depth: number): void {
		const row = container.createDiv({ cls: "task-panel-task-row" });
		if (depth > 0) {
			row.style.paddingLeft = `${depth * 20}px`;
		}
		if (task.completed) {
			row.addClass("task-panel-completed");
		}

		const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
		checkbox.checked = task.completed;
		checkbox.addClass("task-list-item-checkbox");
		checkbox.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleTask(task);
		});

		const textEl = row.createSpan({ cls: "task-panel-task-text" });
		const sourcePath = this.currentFile?.path ?? "";
		MarkdownRenderer.render(this.app, task.text, textEl, sourcePath, this);
		this.enhanceLinks(textEl, sourcePath);

		row.addEventListener("click", (e) => {
			this.handleRowClick(e, checkbox, task);
		});
	}

	// -- Click handling --------------------------------------------------

	private handleRowClick(e: MouseEvent, checkbox: HTMLElement, task: Task): void {
		const target = e.target as HTMLElement;
		if (target === checkbox) return;

		const tagEl = target.closest("a.tag") as HTMLElement | null;
		if (tagEl) {
			e.preventDefault();
			this.openTagSearch(tagEl.getText().trim());
			return;
		}

		const linkEl = target.closest("a.internal-link") as HTMLAnchorElement | null;
		if (linkEl) {
			e.preventDefault();
			const href = linkEl.getAttr("href");
			if (href) {
				const newLeaf = e.ctrlKey || e.metaKey;
				this.app.workspace.openLinkText(href, this.currentFile?.path ?? "", newLeaf);
			}
			return;
		}

		if (target.closest("a")) return;

		this.scrollToTask(task);
	}

	private openTagSearch(tag: string): void {
		const search = (
			this.app as unknown as {
				internalPlugins: {
					getPluginById(id: string): {
						instance: { openGlobalSearch(query: string): void };
					} | null;
				};
			}
		).internalPlugins?.getPluginById("global-search");

		search?.instance?.openGlobalSearch(`tag:${tag}`);
	}

	// -- Link enhancement ------------------------------------------------

	private enhanceLinks(container: HTMLElement, sourcePath: string): void {
		const links = container.querySelectorAll("a.internal-link");
		for (let i = 0; i < links.length; i++) {
			const link = links[i] as HTMLAnchorElement;
			const href = link.getAttr("href");
			if (!href) continue;

			if (!this.app.metadataCache.getFirstLinkpathDest(href, sourcePath)) {
				link.addClass("is-unresolved");
			}

			link.addEventListener("mouseover", (e) => {
				this.app.workspace.trigger("hover-link", {
					event: e,
					source: VIEW_TYPE_TASK_PANEL,
					hoverParent: this,
					targetEl: link,
					linktext: href,
					sourcePath,
				});
			});
		}
	}

	// -- Task toggling ---------------------------------------------------

	private async toggleTask(task: Task): Promise<void> {
		if (!this.currentFile) return;

		const content = await this.app.vault.read(this.currentFile);
		const lines = content.split("\n");
		const line = lines[task.line];
		if (line === undefined) return;

		if (task.completed) {
			lines[task.line] = line.replace(/\[.\]/, "[ ]");
		} else {
			lines[task.line] = line.replace(/\[ \]/, "[x]");
		}

		await this.app.vault.modify(this.currentFile, lines.join("\n"));
	}

	// -- Scroll to task --------------------------------------------------

	private scrollToTask(task: Task): void {
		if (!this.currentFile) return;

		const target = this.findEditorForFile(this.currentFile);
		if (!target) return;

		this.app.workspace.revealLeaf(target.leaf);

		const editor = target.editor;
		editor.setCursor({ line: task.line, ch: 0 });

		const scrollEl = this.getScrollElement(editor);
		if (scrollEl) {
			requestAnimationFrame(() => {
				const activeLine = scrollEl.querySelector(".cm-active.cm-line");
				if (activeLine) {
					activeLine.scrollIntoView({ block: "center", behavior: "smooth" });
				} else {
					editor.scrollIntoView(
						{ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } },
						true
					);
				}
				this.flashLine(scrollEl);
			});
		} else {
			editor.scrollIntoView(
				{ from: { line: task.line, ch: 0 }, to: { line: task.line, ch: 0 } },
				true
			);
		}
	}

	private findEditorForFile(file: TFile): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path) {
				return leaf.view;
			}
		}
		return null;
	}

	private getScrollElement(editor: unknown): HTMLElement | null {
		return (editor as { cm?: { scrollDOM?: HTMLElement } })?.cm?.scrollDOM ?? null;
	}

	// -- Flash highlight -------------------------------------------------

	private flashLine(scrollEl: HTMLElement): void {
		const activeLine = scrollEl.querySelector(".cm-active.cm-line") as HTMLElement | null;
		if (!activeLine) return;

		activeLine.addClass("task-panel-flash");
		setTimeout(() => {
			activeLine.removeClass("task-panel-flash");
		}, 1500);
	}
}

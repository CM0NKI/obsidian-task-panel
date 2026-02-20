import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, TaskPanelSettingTab, TaskPanelSettings } from "./settings";
import { TaskPanelView, VIEW_TYPE_TASK_PANEL } from "./TaskPanelView";

export default class TaskPanelPlugin extends Plugin {
	settings: TaskPanelSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_TASK_PANEL,
			(leaf) => new TaskPanelView(leaf, this)
		);

		this.addRibbonIcon("list-checks", "Open task panel", () => {
			this.activateView();
		});

		this.addCommand({
			id: "show-task-panel",
			name: "Show task panel",
			callback: () => {
				this.activateView();
			},
		});

		this.addSettingTab(new TaskPanelSettingTab(this.app, this));

		// Restore the view if it was open in a previous session
		this.app.workspace.onLayoutReady(() => {
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_PANEL);
			if (leaves.length > 0) {
				// View already restored by layout — trigger a refresh
				for (const leaf of leaves) {
					if (leaf.view instanceof TaskPanelView) {
						leaf.view.redraw();
					}
				}
			}
		});
	}

	onunload(): void {
		// Obsidian handles leaf cleanup automatically — do not detach leaves here
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<TaskPanelSettings>
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	private refreshViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_PANEL);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof TaskPanelView) {
				view.redraw();
			}
		}
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(VIEW_TYPE_TASK_PANEL)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_TASK_PANEL,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}
}

import { App, PluginSettingTab, Setting } from "obsidian";
import type TaskPanelPlugin from "./main";

export interface TaskPanelSettings {
	showCompleted: boolean;
	groupByHeading: boolean;
	sortOrder: "file-order" | "alphabetical";
}

export const DEFAULT_SETTINGS: TaskPanelSettings = {
	showCompleted: false,
	groupByHeading: true,
	sortOrder: "file-order",
};

export class TaskPanelSettingTab extends PluginSettingTab {
	plugin: TaskPanelPlugin;

	constructor(app: App, plugin: TaskPanelPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Show completed tasks")
			.setDesc(
				"When enabled, completed tasks are shown as struck-through at the bottom of each group."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showCompleted)
					.onChange(async (value) => {
						this.plugin.settings.showCompleted = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Group by heading")
			.setDesc(
				"When enabled, tasks are grouped under their parent heading. When disabled, tasks are shown as a flat list."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupByHeading)
					.onChange(async (value) => {
						this.plugin.settings.groupByHeading = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sort order")
			.setDesc("How tasks are sorted within each group.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("file-order", "File order")
					.addOption("alphabetical", "Alphabetical")
					.setValue(this.plugin.settings.sortOrder)
					.onChange(async (value) => {
						this.plugin.settings.sortOrder = value as TaskPanelSettings["sortOrder"];
						await this.plugin.saveSettings();
					})
			);
	}
}

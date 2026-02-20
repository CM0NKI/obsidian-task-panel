# Task Panel

An Obsidian plugin that adds a sidebar panel showing all open tasks from the currently active note.

## Features

- **Sidebar panel** — appears in the right sidebar alongside Outline and Tags
- **Live updates** — automatically refreshes when switching notes or editing tasks
- **Grouped by heading** — tasks are organized under their parent headings (like the Outline view)
- **Clickable tasks** — click a task to scroll to it in the editor
- **Toggle completion** — check off tasks directly from the panel
- **Nested tasks** — sub-tasks are rendered indented under their parent
- **Theme-aware** — uses Obsidian's CSS variables, works with any theme including dark mode

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Show completed tasks | Off | Show `- [x]` tasks as struck-through at the bottom of each group |
| Group by heading | On | Group tasks under their parent heading, or show a flat list |
| Sort order | File order | Sort tasks by file order or alphabetically |

## Commands

- **Task Panel: Show task panel** — opens or reveals the sidebar panel (assignable to a hotkey)

## Development

```bash
npm install
npm run dev    # watch mode with sourcemaps
npm run build  # production build
```

## Installation

### From source

1. Clone this repo into your vault's `.obsidian/plugins/` directory
2. Run `npm install && npm run build`
3. Enable "Task Panel" in Settings → Community plugins

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `.obsidian/plugins/task-panel/` in your vault
3. Copy the three files into that folder
4. Enable "Task Panel" in Settings → Community plugins

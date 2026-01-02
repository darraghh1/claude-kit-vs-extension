# ClaudeKit Plans - Architecture Overview

This document provides a high-level overview of how the ClaudeKit Plans VS Code extension works, making it easy for contributors to understand and extend the codebase.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [File Structure](#file-structure)
4. [Data Flow](#data-flow)
5. [Key Components](#key-components)
6. [Extension Lifecycle](#extension-lifecycle)
7. [How Parsing Works](#how-parsing-works)
8. [Extending the Extension](#extending-the-extension)

---

## Overview

ClaudeKit Plans is a VS Code extension that displays plan progress in the Explorer sidebar. It:

- **Scans** for `plan.md` files in a `./plans` directory
- **Parses** phase information from markdown tables
- **Displays** progress in a TreeView with status icons
- **Shows** a status bar item for quick access
- **Watches** for file changes and auto-refreshes

---

## Core Concepts

### Plans and Phases

A **Plan** is a directory containing a `plan.md` file. Each plan has multiple **Phases** which are extracted from the markdown content.

```
plans/
├── 251231-feature-auth/
│   ├── plan.md              ← Main plan file
│   ├── phase-01-database.md ← Phase detail file
│   └── phase-02-api.md      ← Phase detail file
└── 260101-bug-fix/
    └── plan.md
```

### Status Types

**PlanStatus**: `completed` | `in-progress` | `pending` | `cancelled`
**PhaseStatus**: `completed` | `in-progress` | `pending`

---

## File Structure

```
src/
├── extension.ts          # Entry point, activation, commands
├── types.ts              # TypeScript interfaces and types
├── treeProvider.ts       # TreeView sidebar component
├── statusBar.ts          # Status bar at bottom of VS Code
├── planProject.ts        # Per-workspace state management
└── parser/
    ├── planParser.ts     # Extracts phases from plan.md
    ├── metadataExtractor.ts  # Extracts frontmatter and metadata
    ├── planScanner.ts    # Discovers plan.md files
    └── statusUtils.ts    # Status normalization helpers
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Extension Activation                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PlansProject.initialize()                                       │
│  - Checks if ./plans directory exists                            │
│  - Sets up file watcher for changes                              │
│  - Calls refresh() to load data                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  planScanner.scanPlansDirectory()                                │
│  - Finds all plan.md files in subdirectories                     │
│  - Returns array of file paths                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  metadataExtractor.extractPlanData()                             │
│  - Reads plan.md content                                         │
│  - Extracts frontmatter (YAML) metadata                          │
│  - Calls planParser to get phases                                │
│  - Returns complete PlanData object                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  planParser.parsePlanTable()                                     │
│  - Tries each format parser in order                             │
│  - Returns first successful parse (PhaseData[])                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  UI Update                                                       │
│  - PlansTreeProvider.setPlans() → Updates sidebar                │
│  - PlansStatusBar.setProgress() → Updates status bar             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. extension.ts - Entry Point

The `activate()` function is called when VS Code detects a workspace with plans. It:

1. Creates the TreeView provider
2. Creates the status bar
3. Registers all commands
4. Initializes PlansProject for each workspace folder
5. Sets up configuration change listeners

```typescript
// Key exports for other modules
export function getTreeProvider(): PlansTreeProvider;
export function getStatusBar(): PlansStatusBar;
export function updateUI(progress: ProjectProgress): void;
```

### 2. treeProvider.ts - Sidebar TreeView

Implements VS Code's `TreeDataProvider<TreeElement>` interface:

- `getChildren(element?)` - Returns child items (plans at root, phases under plans)
- `getTreeItem(element)` - Returns the visual representation
- `refresh()` - Fires change event to redraw tree

**Tree Item Classes:**
- `PlanTreeItem` - Collapsible plan with progress badge
- `PhaseTreeItem` - Leaf node with status icon
- `InfoTreeItem` - Placeholder for empty states

### 3. statusBar.ts - Progress Summary

Shows current plan progress in the bottom status bar:
- Icon indicates status (✓ completed, ⟳ in-progress, 📁 other)
- Text shows `3/8 · feature-name`
- Click opens the plan.md file

### 4. planProject.ts - Workspace State

Each workspace folder gets its own PlansProject instance that:
- Manages file system watchers
- Debounces rapid file changes (500ms)
- Emits `onDidChange` events when data updates
- Provides diagnostic information

### 5. Parser Module

#### planParser.ts
The heart of the extension. Supports 5 different markdown table formats:

| Format | Example |
|--------|---------|
| Multi-column | `\| # \| Phase \| Status \| Link \|` |
| Link-first | `\| [Phase 1](path) \| Desc \| Status \|` |
| Numbered list | `1. **Name** - ✅ COMPLETE` |
| Heading-based | `### Phase 1: Name` with `- Status: ...` |
| Checkbox | `- [x] **[Phase 1](path)**` |

#### metadataExtractor.ts
Extracts rich metadata from:
- YAML frontmatter (title, priority, tags, etc.)
- Header section (regex fallback)
- Directory name (date parsing)

#### planScanner.ts
Simple directory scanner that finds all `plan.md` files.

#### statusUtils.ts
Normalizes status strings to standard enum values.

---

## Extension Lifecycle

### Activation
```
VS Code detects plans/ directory
       ↓
activate() called
       ↓
Create singletons (treeProvider, statusBar)
       ↓
Register commands
       ↓
Initialize PlansProject per workspace
       ↓
Load and display data
```

### File Change
```
User edits plan.md or phase-*.md
       ↓
FileSystemWatcher triggers
       ↓
Debounce timer starts (500ms)
       ↓
PlansProject.refresh() called
       ↓
Re-parse all plan files
       ↓
Emit onDidChange event
       ↓
TreeView and StatusBar update
```

### Deactivation
```
deactivate() called
       ↓
Dispose all subscriptions
       ↓
Dispose all projects
       ↓
Clear singletons
```

---

## How Parsing Works

The parser uses a **fallback chain** - it tries each format in order and stops at the first successful parse:

```typescript
function parsePlanTable(planFilePath: string): PhaseData[] {
  // Try multi-column table first (most common)
  phases = parseMultiColumnTable(content, dir, planFilePath);
  if (phases.length > 0) return phases;

  // Try link-first format
  phases = parseLinkFirstTable(content, dir);
  if (phases.length > 0) return phases;

  // Try numbered list
  phases = parseNumberedListWithStatus(content, planFilePath);
  if (phases.length > 0) return phases;

  // ... more formats
}
```

### Status Normalization

The `normalizeStatus()` function maps various status strings to standard values:

| Input | Output |
|-------|--------|
| "complete", "done", "✅", "✓" | `completed` |
| "in-progress", "wip", "active", "🔄" | `in-progress` |
| anything else | `pending` |

---

## Extending the Extension

### Adding a New Table Format

1. Add a new parse function in `planParser.ts`:
```typescript
function parseMyNewFormat(content: string, dir: string): PhaseData[] {
  // Your parsing logic here
}
```

2. Call it from `parsePlanTable()` in the fallback chain
3. Add test fixtures in `planParser.test.ts`

### Adding New Metadata Fields

1. Add the field to `PlanData` interface in `types.ts`
2. Extract it in `metadataExtractor.ts`:
   - Add to `extractFromFrontmatter()`
   - Add to `extractFromHeader()` if needed
3. Use it in `treeProvider.ts` or `statusBar.ts`

### Adding a New Command

1. Register in `extension.ts`:
```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('claudekit.myCommand', () => {
    // Command logic
  })
);
```

2. Add to `package.json` contributes.commands
3. Optionally add to menus in package.json

---

## Testing

The extension uses Mocha for unit testing. Tests are colocated with source files:

```
src/parser/planParser.test.ts      # Parser tests
src/parser/statusUtils.test.ts     # Status normalization tests
src/parser/metadataExtractor.test.ts  # Metadata extraction tests
src/treeProvider.test.ts           # TreeView data structure tests
src/statusBar.test.ts              # Status bar logic tests
```

Run tests: `npm test`

---

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TreeDataProvider Docs](https://code.visualstudio.com/api/extension-guides/tree-view)
- [gray-matter](https://github.com/jonschlinkert/gray-matter) - YAML frontmatter parser

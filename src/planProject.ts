/**
 * PlansProject - Per-workspace state management
 *
 * This class manages the state for a single workspace folder, handling:
 * - Plan detection and parsing
 * - File system watching for live updates
 * - Debouncing rapid changes to prevent UI flicker
 * - Progress aggregation across all plans
 * - Event emission for UI synchronization
 *
 * Each workspace folder in VS Code gets its own PlansProject instance.
 * This supports multi-root workspaces where each folder can have its own plans.
 *
 * @module planProject
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PlanData, ProjectProgress, ExtensionSettings } from './types';
import { scanPlansDirectory } from './parser/planScanner';
import { extractPlanData } from './parser/metadataExtractor';

/**
 * Debounce delay for file watching (milliseconds).
 * When a file changes rapidly (e.g., during save), we wait this long
 * before triggering a refresh to avoid excessive re-parsing.
 */
const DEBOUNCE_DELAY = 500;

/**
 * Manages plan state for a single workspace folder.
 *
 * Lifecycle:
 * 1. Constructor - stores workspace info and settings
 * 2. initialize() - checks for plans, sets up watchers, does initial load
 * 3. refresh() - called whenever plans need to be re-parsed
 * 4. dispose() - cleanup when workspace is closed or extension deactivated
 *
 * @example
 * const project = new PlansProject(workspaceFolder, settings);
 * await project.initialize();
 * project.onDidChange(() => updateUI(project.getProgress()));
 */
export class PlansProject implements vscode.Disposable {
  // Workspace configuration
  private readonly workspaceRoot: string;    // Absolute path to workspace folder
  private readonly projectName: string;      // Display name of workspace

  // State
  private progress: ProjectProgress | null = null;  // Cached progress data

  // File system watchers
  private fileWatcher: vscode.FileSystemWatcher | null = null;   // Watches plan.md
  private phaseWatcher: vscode.FileSystemWatcher | null = null;  // Watches phase-*.md

  // Debounce timer for file changes
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Resolved path to plans directory
  private plansPath: string;

  // Track all disposables for cleanup
  private disposables: vscode.Disposable[] = [];

  // Event emitter - fires when plans data changes
  // Other components subscribe to this to know when to update UI
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  /**
   * Create a new PlansProject for a workspace folder.
   *
   * @param workspaceFolder - VS Code workspace folder object
   * @param settings - Extension settings (plansPath, autoRefresh, etc.)
   */
  constructor(
    workspaceFolder: vscode.WorkspaceFolder,
    private readonly settings: ExtensionSettings
  ) {
    // Store workspace info
    this.workspaceRoot = workspaceFolder.uri.fsPath;
    this.projectName = workspaceFolder.name;

    // Resolve the plans path relative to workspace root
    // e.g., "./plans" → "/workspace/my-project/plans"
    this.plansPath = path.resolve(this.workspaceRoot, settings.plansPath);
  }

  /**
   * Initialize the project - detect plans and set up file watching.
   *
   * This should be called once after construction. It:
   * 1. Checks if the plans directory exists
   * 2. Sets up file watchers (if auto-refresh enabled)
   * 3. Performs initial plan load
   *
   * @returns true if plans were found and loaded, false otherwise
   */
  async initialize(): Promise<boolean> {
    // Guard: if plans directory doesn't exist, this workspace has no plans
    if (!fs.existsSync(this.plansPath)) {
      console.log(`ClaudeKit: No plans directory at ${this.plansPath}`);
      return false;
    }

    // Set up file watchers to detect changes in real-time
    // Only if auto-refresh is enabled in settings
    if (this.settings.autoRefresh) {
      this.setupFileWatcher();
    }

    // Do the initial load of all plans
    await this.refresh();

    // Return true if we found any plans
    return this.progress !== null && this.progress.plans.length > 0;
  }

  /**
   * Set up file system watchers for plan files.
   *
   * Creates two watchers:
   * 1. plan.md files - main plan documents
   * 2. phase-*.md files - phase detail documents
   *
   * Changes trigger a debounced refresh to update the UI.
   */
  private setupFileWatcher(): void {
    // Debounced change handler - waits for rapid changes to settle
    const handleChange = () => {
      // Cancel any pending refresh
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      // Schedule a new refresh after the debounce delay
      this.debounceTimer = setTimeout(() => {
        this.refresh();
      }, DEBOUNCE_DELAY);
    };

    // === Watch plan.md files ===
    // Pattern matches any plan.md file in any subdirectory
    const planPattern = new vscode.RelativePattern(this.plansPath, '**/plan.md');

    // Create the watcher and register for all event types
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(planPattern);
    this.disposables.push(this.fileWatcher);
    this.disposables.push(this.fileWatcher.onDidChange(handleChange));  // File modified
    this.disposables.push(this.fileWatcher.onDidCreate(handleChange));  // New file created
    this.disposables.push(this.fileWatcher.onDidDelete(handleChange));  // File deleted

    // === Watch phase-*.md files ===
    // Pattern matches phase files like "phase-01-database.md"
    const phasePattern = new vscode.RelativePattern(
      this.plansPath,
      '**/phase-*.md'
    );

    // Same pattern: create watcher, register for all events
    this.phaseWatcher = vscode.workspace.createFileSystemWatcher(phasePattern);
    this.disposables.push(this.phaseWatcher);
    this.disposables.push(this.phaseWatcher.onDidChange(handleChange));
    this.disposables.push(this.phaseWatcher.onDidCreate(handleChange));
    this.disposables.push(this.phaseWatcher.onDidDelete(handleChange));

    console.log(`ClaudeKit: Watching for changes in ${this.plansPath}`);
  }

  /**
   * Refresh plans data by re-scanning and re-parsing all plans.
   *
   * Called:
   * - On initial load
   * - When a file change is detected
   * - When user manually triggers refresh command
   *
   * This is async to avoid blocking the UI during parsing.
   */
  async refresh(): Promise<void> {
    try {
      // Step 1: Scan the plans directory for plan.md files
      const planFiles = await scanPlansDirectory(this.plansPath);

      // Step 2: Parse each plan file to extract metadata and phases
      // Use Promise.all to process files in parallel for better performance
      const planPromises = planFiles.map(async (planFile) => {
        try {
          // Extract full plan data (metadata + phases)
          return await extractPlanData(planFile);
        } catch (error) {
          // Log but don't fail - one bad plan shouldn't break everything
          console.error(`ClaudeKit: Failed to parse ${planFile}:`, error);
          return null;
        }
      });

      const results = await Promise.all(planPromises);

      // Filter out nulls (failed parses)
      const plans = results.filter((p): p is PlanData => p !== null);

      // Step 3: Calculate aggregate progress across all plans
      // Total phases = sum of all plans' phase counts
      const totalPhases = plans.reduce((sum, p) => sum + p.totalCount, 0);
      // Completed phases = sum of all completed phases
      const completedPhases = plans.reduce(
        (sum, p) => sum + p.completedCount,
        0
      );

      // Build the progress object
      this.progress = {
        rootPath: this.workspaceRoot,
        projectName: this.projectName,
        plans,
        totalPhases,
        completedPhases,
        // Calculate percentage, avoiding division by zero
        percentage:
          totalPhases > 0
            ? Math.round((completedPhases / totalPhases) * 100)
            : 0,
      };

      // Step 4: Notify all listeners that data has changed
      // This triggers UI updates in TreeView and StatusBar
      this._onDidChange.fire();
    } catch (error) {
      console.error('ClaudeKit: Failed to refresh plans:', error);
    }
  }

  /**
   * Get current progress data.
   * Returns null if not yet loaded or load failed.
   */
  getProgress(): ProjectProgress | null {
    return this.progress;
  }

  /**
   * Get the display name of this workspace folder.
   */
  getName(): string {
    return this.projectName;
  }

  /**
   * Get the absolute path to this workspace folder.
   */
  getRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Get the absolute path to the plans directory.
   */
  getPlansPath(): string {
    return this.plansPath;
  }

  /**
   * Get diagnostic information for troubleshooting.
   *
   * Returns a formatted string with details about:
   * - Paths and configuration
   * - Whether plans directory exists
   * - Number of plans found
   * - Progress statistics
   *
   * Used by the "ClaudeKit: Show Diagnostics" command.
   */
  getDiagnostics(): string {
    const lines: string[] = [
      // Header
      `## Project: ${this.projectName}`,
      // Configuration
      `- Root: ${this.workspaceRoot}`,
      `- Plans Path: ${this.plansPath}`,
      `- Plans Directory Exists: ${fs.existsSync(this.plansPath) ? 'Yes' : 'No'}`,
      `- Auto Refresh: ${this.settings.autoRefresh ? 'Enabled' : 'Disabled'}`,
    ];

    // Add progress info if available
    if (this.progress) {
      lines.push(
        `- Plans Found: ${this.progress.plans.length}`,
        `- Total Phases: ${this.progress.totalPhases}`,
        `- Completed: ${this.progress.completedPhases}`,
        `- Progress: ${this.progress.percentage}%`
      );

      // List individual plans
      if (this.progress.plans.length > 0) {
        lines.push('', '### Plans:');
        for (const plan of this.progress.plans) {
          lines.push(
            `- ${plan.name}: ${plan.completedCount}/${plan.totalCount} (${plan.percentage}%)`
          );
        }
      }
    } else {
      lines.push('- Progress: Not loaded');
    }

    return lines.join('\n');
  }

  /**
   * Dispose of all resources.
   *
   * Called when:
   * - Workspace folder is removed
   * - Extension is deactivated
   * - Settings change requires re-initialization
   *
   * Cleans up:
   * - Debounce timer
   * - File watchers
   * - Event emitter
   */
  dispose(): void {
    // Cancel any pending debounced refresh
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Dispose all registered disposables (watchers, event subscriptions)
    this.disposables.forEach((d) => d.dispose());

    // Dispose the event emitter
    this._onDidChange.dispose();
  }
}

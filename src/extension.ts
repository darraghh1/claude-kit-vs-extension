/**
 * ClaudeKit Plans Extension - Entry Point
 *
 * This is the main entry point for the VS Code extension. It handles:
 * - Extension lifecycle (activation/deactivation)
 * - Command registration
 * - Workspace folder management
 * - UI component initialization (TreeView, StatusBar)
 * - Settings/configuration changes
 *
 * VS Code calls `activate()` when the extension should start (based on
 * activation events in package.json), and `deactivate()` when shutting down.
 *
 * @module extension
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionSettings, PlanData, PhaseData, ProjectProgress } from './types';
import {
  PlansTreeProvider,
  PlanTreeItem,
  PhaseTreeItem,
  FilterMode,
  FILTER_LABELS,
} from './treeProvider';
import { PlansStatusBar } from './statusBar';
import { PlansProject } from './planProject';

// ============================================================================
// Module-level state (singletons and collections)
// ============================================================================

/**
 * Reusable OutputChannel for diagnostics.
 * Created lazily on first use. Reused to avoid cluttering the Output panel
 * with multiple channels if user runs diagnostics multiple times.
 */
let diagnosticsChannel: vscode.OutputChannel | undefined;

/**
 * TreeDataProvider singleton - manages the sidebar TreeView.
 * Exposed at module level so commands can access it.
 */
let treeProvider: PlansTreeProvider;

/**
 * StatusBar singleton - shows progress in the VS Code status bar.
 * Click action opens the current plan.
 */
let statusBar: PlansStatusBar;

/**
 * Active PlansProject instances (one per workspace folder with plans).
 * These are the "brains" that watch for file changes and parse plan data.
 */
let projects: PlansProject[] = [];

/**
 * Event subscriptions for project change notifications.
 * Tracked separately from projects for proper cleanup - we need to
 * dispose these before disposing projects to avoid race conditions.
 */
let projectSubscriptions: vscode.Disposable[] = [];

// ============================================================================
// Extension Lifecycle
// ============================================================================

/**
 * Extension activation - VS Code calls this when the extension should start.
 *
 * Activation happens when:
 * - User opens a workspace containing a "plans" directory
 * - User manually runs an extension command
 * - Specified in package.json activation events
 *
 * @param context - Extension context provided by VS Code for state management
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  console.log('ClaudeKit Plans: Activating...');

  // Load user settings from VS Code configuration
  const settings = getSettings();

  // === Initialize UI Components ===

  // TreeDataProvider controls what appears in the Explorer sidebar
  // Pass context so it can persist filter state across sessions
  treeProvider = new PlansTreeProvider(context);

  // Register the TreeView with VS Code
  // 'claudekitPlansView' matches the view ID in package.json
  const treeView = vscode.window.createTreeView('claudekitPlansView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,  // Show collapse all button in view header
  });

  // Add to subscriptions for automatic cleanup on deactivation
  context.subscriptions.push(treeView);
  context.subscriptions.push(treeProvider);

  // StatusBar shows progress at the bottom of VS Code
  statusBar = new PlansStatusBar();
  context.subscriptions.push(statusBar);

  // Only show status bar if enabled in settings (default: true)
  if (settings.showStatusBar) {
    statusBar.show();
  }

  // === Register Commands ===
  // Commands are how users interact with the extension
  registerCommands(context);

  // === Initialize Projects ===
  // Scan workspace folders and set up file watching
  await initializeProjects(settings);

  // === Welcome Message (First-Time Users) ===
  // Show once per installation using globalState for persistence
  const hasShownWelcome = context.globalState.get<boolean>(
    'hasShownWelcome',
    false
  );
  if (!hasShownWelcome && projects.length > 0) {
    // Mark as shown so we don't show again
    context.globalState.update('hasShownWelcome', true);
    showWelcomeMessage();
  }

  // === Watch for Workspace Changes ===
  // Re-initialize if user adds/removes folders from workspace
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      // Re-scan all workspace folders
      await initializeProjects(getSettings());
    })
  );

  // === Watch for Configuration Changes ===
  // React to settings changes (plansPath, showStatusBar, autoRefresh)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      // Only care about our extension's settings
      if (e.affectsConfiguration('claudekit')) {
        const newSettings = getSettings();

        // Re-initialize projects with new settings
        // This handles changes to plansPath or autoRefresh
        await initializeProjects(newSettings);

        // Update status bar visibility
        if (newSettings.showStatusBar) {
          statusBar.show();
        } else {
          statusBar.hide();
        }
      }
    })
  );

  console.log('ClaudeKit Plans: Activated successfully');
}

/**
 * Register all extension commands with VS Code.
 *
 * Commands are defined in package.json and implemented here.
 * They can be invoked via:
 * - Command Palette (Ctrl+Shift+P)
 * - Keyboard shortcuts
 * - Tree item click handlers
 * - Context menus
 *
 * @param context - Extension context for subscription management
 */
function registerCommands(context: vscode.ExtensionContext): void {
  // === Refresh Command ===
  // Manually trigger a refresh of all plan data
  context.subscriptions.push(
    vscode.commands.registerCommand('claudekit.refresh', async () => {
      // Refresh each project (triggers file re-scan and re-parse)
      for (const project of projects) {
        await project.refresh();
      }
      // Confirm to user
      vscode.window.showInformationMessage('ClaudeKit: Plans refreshed');
    })
  );

  // === Diagnose Command ===
  // Show diagnostic information for troubleshooting
  context.subscriptions.push(
    vscode.commands.registerCommand('claudekit.diagnose', () => {
      showDiagnostics();
    })
  );

  // === Open Plan Command ===
  // Opens a plan.md file in the editor
  // Can be called from:
  // - Tree item click (receives file path string)
  // - Context menu (receives PlanTreeItem object)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudekit.openPlan',
      async (arg: string | PlanTreeItem) => {
        let filePath: string | undefined;

        if (typeof arg === 'string') {
          // Called from tree item click - arg is the file path
          filePath = arg;
        } else if (arg instanceof PlanTreeItem) {
          // Called from context menu - extract path from tree item
          filePath = arg.plan.path;
        }

        if (filePath) {
          await openFile(filePath);
        }
      }
    )
  );

  // === Open Phase Command ===
  // Opens a phase file (or plan.md if no separate phase file)
  // Handles both click and context menu invocations
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'claudekit.openPhase',
      async (arg1: PhaseData | PhaseTreeItem, arg2?: PlanData) => {
        let phase: PhaseData;
        let plan: PlanData;

        if (arg1 instanceof PhaseTreeItem) {
          // Called from context menu - arg1 is PhaseTreeItem
          phase = arg1.phase;
          plan = arg1.plan;
        } else {
          // Called from tree item click - separate PhaseData and PlanData args
          phase = arg1;
          if (!arg2) {
            console.error('Missing plan data for openPhase command');
            return;
          }
          plan = arg2;
        }

        // Open phase file if it exists, otherwise fall back to plan.md
        // (phases without separate files reference the plan itself)
        const filePath = phase.file || plan.path;
        await openFile(filePath);
      }
    )
  );

  // === Open Current Plan Command ===
  // Opens the "current" plan (the one shown in status bar)
  // Triggered by clicking the status bar item
  context.subscriptions.push(
    vscode.commands.registerCommand('claudekit.openCurrentPlan', () => {
      const plan = statusBar.getCurrentPlan();
      if (plan) {
        openFile(plan.path);
      } else {
        vscode.window.showInformationMessage('ClaudeKit: No active plan');
      }
    })
  );

  // === Filter Command ===
  // Shows QuickPick to select which plans to display
  context.subscriptions.push(
    vscode.commands.registerCommand('claudekit.filter', async () => {
      const currentFilter = treeProvider.getFilterMode();

      // Build QuickPick items from all available filter modes
      const filterModes: FilterMode[] = ['all', 'active', 'in-progress', 'pending', 'completed'];
      const items = filterModes.map((mode) => ({
        // Show checkmark next to currently active filter
        label: mode === currentFilter ? `$(check) ${FILTER_LABELS[mode]}` : FILTER_LABELS[mode],
        description: mode === currentFilter ? 'Currently active' : undefined,
        mode,  // Store mode for use when selected
      }));

      // Show the QuickPick and wait for selection
      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select filter mode',
        title: 'Filter Plans',
      });

      // Apply the selected filter
      if (selection) {
        await treeProvider.setFilterMode(selection.mode);
      }
    })
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Open a file in the VS Code editor.
 *
 * @param filePath - Absolute path to the file to open
 */
async function openFile(filePath: string): Promise<void> {
  try {
    // Convert file path to VS Code URI
    const uri = vscode.Uri.file(filePath);
    // Open the document (loads it into memory)
    const doc = await vscode.workspace.openTextDocument(uri);
    // Show it in the editor
    await vscode.window.showTextDocument(doc);
  } catch (error) {
    // File might not exist or be unreadable
    vscode.window.showErrorMessage(`Failed to open: ${filePath}`);
  }
}

/**
 * Initialize PlansProject instances for all workspace folders.
 *
 * This function:
 * 1. Disposes existing projects (clean slate)
 * 2. Creates a PlansProject for each workspace folder
 * 3. Sets up change listeners for live updates
 * 4. Updates the UI with initial data
 *
 * @param settings - Current extension settings
 */
async function initializeProjects(settings: ExtensionSettings): Promise<void> {
  // === Cleanup Existing State ===
  // Dispose subscriptions first to prevent callbacks during disposal
  projectSubscriptions.forEach((s) => s.dispose());
  projectSubscriptions = [];

  // Then dispose the projects themselves
  projects.forEach((p) => p.dispose());
  projects = [];

  // === Check for Workspace ===
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    // No workspace open - clear UI and return
    treeProvider.setPlans([]);
    statusBar.setProgress(null);
    return;
  }

  // === Initialize Each Workspace Folder ===
  for (const folder of workspaceFolders) {
    // Create project for this folder
    const project = new PlansProject(folder, settings);

    // Initialize checks for plans directory and sets up file watching
    // Returns false if no plans directory exists
    const success = await project.initialize();

    if (success) {
      // This folder has plans - track the project
      projects.push(project);

      // Subscribe to change events for live UI updates
      // When files change, the project emits 'onDidChange'
      const subscription = project.onDidChange(() => {
        updateUIFromProjects();
      });
      projectSubscriptions.push(subscription);
    }
  }

  // === Update UI with Initial Data ===
  updateUIFromProjects();
}

/**
 * Aggregate data from all projects and update UI components.
 *
 * Called whenever any project's data changes. Combines data from
 * all workspace folders into a single view.
 */
function updateUIFromProjects(): void {
  // Aggregate plans from all projects
  const allPlans: PlanData[] = [];
  let totalPhases = 0;
  let completedPhases = 0;

  for (const project of projects) {
    const progress = project.getProgress();
    if (progress) {
      // Collect all plans
      allPlans.push(...progress.plans);
      // Sum up phase counts
      totalPhases += progress.totalPhases;
      completedPhases += progress.completedPhases;
    }
  }

  // Build aggregate progress object
  const aggregateProgress: ProjectProgress = {
    rootPath: projects[0]?.getRoot() || '',
    projectName: projects[0]?.getName() || 'Workspace',
    plans: allPlans,
    totalPhases,
    completedPhases,
    // Calculate overall percentage
    percentage:
      totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0,
  };

  // Update UI components
  treeProvider.setPlans(allPlans);
  statusBar.setProgress(aggregateProgress);
}

/**
 * Show welcome message on first activation.
 *
 * Displays a friendly message with plan count and offers
 * to focus the TreeView for new users.
 */
function showWelcomeMessage(): void {
  // Count total plans across all projects
  const planCount = projects.reduce(
    (sum, p) => sum + (p.getProgress()?.plans.length || 0),
    0
  );

  // Show message with "View Plans" action button
  vscode.window
    .showInformationMessage(
      `ClaudeKit Plans activated! Found ${planCount} plan${planCount !== 1 ? 's' : ''}.`,
      'View Plans'
    )
    .then((action) => {
      if (action === 'View Plans') {
        // Focus the TreeView in Explorer sidebar
        vscode.commands.executeCommand('claudekitPlansView.focus');
      }
    });
}

/**
 * Show diagnostic information in an Output channel.
 *
 * Provides comprehensive debug info for troubleshooting issues:
 * - Workspace configuration
 * - Extension settings
 * - Detected projects and plans
 * - Supported formats documentation
 */
function showDiagnostics(): void {
  const lines: string[] = [
    '# ClaudeKit Plans Diagnostics',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
  ];

  // === Workspace Information ===
  const workspaceFolders = vscode.workspace.workspaceFolders;
  lines.push('## Workspace');
  if (workspaceFolders) {
    lines.push(`Folders: ${workspaceFolders.length}`);
    for (const folder of workspaceFolders) {
      lines.push(`- ${folder.name}: ${folder.uri.fsPath}`);
    }
  } else {
    lines.push('No workspace folders open');
  }
  lines.push('');

  // === Current Settings ===
  const settings = getSettings();
  lines.push('## Settings');
  lines.push(`- plansPath: ${settings.plansPath}`);
  lines.push(`- showStatusBar: ${settings.showStatusBar}`);
  lines.push(`- autoRefresh: ${settings.autoRefresh}`);
  lines.push('');

  // === Projects and Plans ===
  if (projects.length === 0) {
    lines.push('## Projects');
    lines.push('No ClaudeKit projects detected.');
    lines.push('');
    lines.push('### Detection looks for:');
    lines.push('- `./plans/*/plan.md` files');
    lines.push('- Configure `claudekit.plansPath` if plans are elsewhere');
  } else {
    lines.push(`## Projects (${projects.length})`);
    lines.push('');

    // Get detailed diagnostics from each project
    for (const project of projects) {
      lines.push(project.getDiagnostics());
      lines.push('');
    }
  }

  // === Documentation: Parser Support ===
  lines.push('## Parser Support');
  lines.push('Supported table formats:');
  lines.push('1. Standard: `| Phase | Name | Status | [Link](path) |`');
  lines.push('2. Link-first: `| [Phase X](path) | Description | Status |`');
  lines.push('3. Number-link: `| 1 | [Name](path) | Status |`');
  lines.push('4. Simple: `| Phase | Description | Status |`');
  lines.push('5. Heading: `### Phase X: Name` with `- Status: ...`');
  lines.push('6. Checkbox: `- [x] **[Phase 1](path)**`');
  lines.push('');

  // === Documentation: Frontmatter Support ===
  lines.push('## Frontmatter Support');
  lines.push('Supported fields:');
  lines.push('- title, description');
  lines.push('- status (pending, in-progress, completed, cancelled)');
  lines.push('- priority (P1/High, P2/Medium, P3/Low)');
  lines.push('- effort (e.g., 4h, 30m, 2d)');
  lines.push('- tags, branch, issue');
  lines.push('- created, completed dates');

  // === Display in Output Channel ===
  // Reuse existing channel to avoid cluttering the Output panel
  if (!diagnosticsChannel) {
    diagnosticsChannel = vscode.window.createOutputChannel(
      'ClaudeKit Diagnostics'
    );
  }
  diagnosticsChannel.clear();
  diagnosticsChannel.appendLine(lines.join('\n'));
  diagnosticsChannel.show();  // Brings Output panel to front
}

/**
 * Get extension settings from VS Code configuration.
 *
 * Settings are defined in package.json under "contributes.configuration"
 * and stored in the user's settings.json.
 *
 * @returns Current settings with defaults applied
 */
function getSettings(): ExtensionSettings {
  // Get the "claudekit" configuration section
  const config = vscode.workspace.getConfiguration('claudekit');

  return {
    // Path to plans directory (relative to workspace root)
    plansPath: config.get<string>('plansPath', './plans'),
    // Whether to show the status bar item
    showStatusBar: config.get<boolean>('showStatusBar', true),
    // Whether to auto-refresh when files change
    autoRefresh: config.get<boolean>('autoRefresh', true),
  };
}

// ============================================================================
// Exported Functions (for use by other modules)
// ============================================================================

/**
 * Get the TreeProvider singleton.
 * Used by PlansProject for integration.
 */
export function getTreeProvider(): PlansTreeProvider {
  return treeProvider;
}

/**
 * Get the StatusBar singleton.
 * Used by PlansProject for integration.
 */
export function getStatusBar(): PlansStatusBar {
  return statusBar;
}

/**
 * Update both TreeView and StatusBar with new progress data.
 * Called by PlansProject when data changes.
 *
 * @param progress - Updated progress data to display
 */
export function updateUI(progress: ProjectProgress): void {
  treeProvider.setPlans(progress.plans);
  statusBar.setProgress(progress);
}

// ============================================================================
// Extension Deactivation
// ============================================================================

/**
 * Extension deactivation - VS Code calls this when shutting down.
 *
 * Performs cleanup:
 * - Disposes event subscriptions
 * - Disposes PlansProject instances (stops file watchers)
 * - Disposes Output channel
 */
export function deactivate(): void {
  // Dispose project change subscriptions first
  projectSubscriptions.forEach((s) => s.dispose());
  projectSubscriptions = [];

  // Dispose all projects (stops file watchers)
  projects.forEach((p) => p.dispose());
  projects = [];

  // Dispose the diagnostics output channel
  diagnosticsChannel?.dispose();
  diagnosticsChannel = undefined;

  console.log('ClaudeKit Plans: Deactivated');
}

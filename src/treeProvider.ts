/**
 * TreeDataProvider Implementation
 *
 * This module manages the Explorer sidebar TreeView showing plan/phase progress.
 * It implements VS Code's TreeDataProvider interface to provide hierarchical
 * data to the tree widget.
 *
 * Architecture:
 * - PlanTreeItem: Top-level collapsible items representing plan.md files
 * - PhaseTreeItem: Leaf nodes for individual phases within a plan
 * - InfoTreeItem: Placeholder items for empty states or information messages
 * - PlansTreeProvider: The TreeDataProvider that ties everything together
 *
 * VS Code's TreeView works by:
 * 1. Calling getChildren() to get items at each level
 * 2. Calling getTreeItem() to get the visual representation
 * 3. Listening to onDidChangeTreeData to know when to refresh
 *
 * @module treeProvider
 */

import * as vscode from 'vscode';
import { PlanData, PhaseData, PlanStatus, PhaseStatus } from './types';
import { getPhaseStatusIcon, getPlanStatusIcon } from './parser/statusUtils';

// ============================================================================
// Filter Types and Configuration
// ============================================================================

/**
 * Filter modes for plan visibility.
 * Users can filter the TreeView to show only specific plan statuses.
 */
export type FilterMode = 'all' | 'active' | 'in-progress' | 'pending' | 'completed';

/**
 * Human-readable labels for filter modes.
 * Used in the QuickPick filter selector.
 */
export const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'All Plans',
  active: 'Active (In Progress + Pending)',
  'in-progress': 'In Progress Only',
  pending: 'Pending Only',
  completed: 'Completed Only',
};

// ============================================================================
// Sort and Filter Functions
// ============================================================================

/**
 * Smart sort comparator for plans.
 *
 * Sorts plans in a sensible order for developers:
 * 1. Status: in-progress first (active work), then pending, then completed
 * 2. Priority: P1 (critical) before P2 before P3
 * 3. Percentage: Higher progress first (shows momentum)
 * 4. Last modified: Recent activity first
 *
 * @param a - First plan to compare
 * @param b - Second plan to compare
 * @returns Negative if a comes first, positive if b comes first
 */
function comparePlans(a: PlanData, b: PlanData): number {
  // Define sort order for status (lower number = higher priority)
  const statusOrder: Record<PlanStatus, number> = {
    'in-progress': 0,  // Active work is most important
    pending: 1,        // Not started but planned
    completed: 2,      // Done - less relevant to show
    cancelled: 3,      // Abandoned - least important
  };

  // Define sort order for priority
  const priorityOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, none: 3 };

  // === Level 1: Sort by status ===
  // In-progress plans float to the top
  const statusDiff = statusOrder[a.status] - statusOrder[b.status];
  if (statusDiff !== 0) return statusDiff;

  // === Level 2: Sort by priority ===
  // P1 (critical) comes before P2 (normal) comes before P3 (low)
  const aPriority = a.priority ?? 'none';
  const bPriority = b.priority ?? 'none';
  const priorityDiff = priorityOrder[aPriority] - priorityOrder[bPriority];
  if (priorityDiff !== 0) return priorityDiff;

  // === Level 3: Sort by completion percentage ===
  // Higher percentage first (shows plans with more progress)
  if (a.percentage !== b.percentage) return b.percentage - a.percentage;

  // === Level 4: Sort by last modified ===
  // Most recently modified first (recent activity)
  return b.lastModified.getTime() - a.lastModified.getTime();
}

/**
 * Filter plans array based on selected filter mode.
 *
 * @param plans - All plans to filter
 * @param mode - Current filter mode
 * @returns Filtered plans array
 */
function filterPlans(plans: PlanData[], mode: FilterMode): PlanData[] {
  switch (mode) {
    case 'active':
      // Show both in-progress and pending (everything not done/cancelled)
      return plans.filter((p) => p.status !== 'completed' && p.status !== 'cancelled');
    case 'in-progress':
      // Only show actively being worked on
      return plans.filter((p) => p.status === 'in-progress');
    case 'pending':
      // Only show not-yet-started plans
      return plans.filter((p) => p.status === 'pending');
    case 'completed':
      // Only show finished plans
      return plans.filter((p) => p.status === 'completed');
    default:
      // 'all' mode - show everything
      return plans;
  }
}

// ============================================================================
// Tree Item Types
// ============================================================================

/**
 * Union type for all tree elements.
 * VS Code's TreeDataProvider needs to know all possible item types.
 */
export type TreeElement = PlanTreeItem | PhaseTreeItem | InfoTreeItem;

/**
 * Plan tree item - represents a plan.md file at the top level.
 *
 * Visual representation:
 * - Collapsible (can expand to show phases)
 * - Shows plan name with optional priority badge: "my-feature [P1]"
 * - Description shows progress fraction: "3/8"
 * - Icon indicates status with semantic coloring
 * - Click opens the plan.md file
 *
 * @example TreeView display:
 * ▶ my-feature [P1]  3/8
 *   ├── Phase 1: Database ✓
 *   └── Phase 2: API ⟳
 */
export class PlanTreeItem extends vscode.TreeItem {
  constructor(public readonly plan: PlanData) {
    // === Build display label ===
    // Format: "plan-name [P1]" (priority badge is optional)
    let label = plan.name;
    if (plan.priority) {
      label += ` [${plan.priority}]`;
    }

    // Call parent constructor with collapsible state
    // Collapsed = shows ▶ arrow, can be expanded
    super(label, vscode.TreeItemCollapsibleState.Collapsed);

    // === Set icon based on plan status ===
    // getPlanStatusIcon returns codicon names like 'check-all', 'sync', etc.
    const iconName = getPlanStatusIcon(plan.status);
    this.iconPath = this.getThemedIcon(iconName, plan.status);

    // === Set description (appears after label in gray) ===
    // Format: "3/8" showing completed/total phases
    this.description = `${plan.completedCount}/${plan.totalCount}`;

    // Unique ID for this tree item (used for state persistence)
    this.id = plan.id;

    // === Build rich tooltip ===
    // Shows detailed info when hovering over the item
    const tooltipLines = [
      plan.name,
      `Progress: ${plan.completedCount}/${plan.totalCount} phases`,
      `Status: ${plan.status}`,
    ];
    // Add optional metadata to tooltip
    if (plan.priority) tooltipLines.push(`Priority: ${plan.priority}`);
    if (plan.effort) tooltipLines.push(`Effort: ${plan.effort}`);
    if (plan.description) tooltipLines.push('', plan.description);

    this.tooltip = tooltipLines.join('\n');

    // Context value is used for 'when' clauses in package.json menus
    this.contextValue = 'plan';

    // === Configure click behavior ===
    // Clicking this item runs the 'claudekit.openPlan' command
    this.command = {
      command: 'claudekit.openPlan',
      title: 'Open Plan',
      arguments: [plan.path],  // Pass file path to command
    };
  }

  /**
   * Get themed icon with status-based coloring.
   *
   * VS Code allows icons to be colored using ThemeColors.
   * We use semantic colors to indicate status at a glance:
   * - Green for completed
   * - Yellow for in-progress
   * - Gray for cancelled
   * - Default color for pending
   *
   * @param iconName - Codicon name (e.g., 'check-all', 'sync')
   * @param status - Plan status for color selection
   * @returns ThemeIcon with appropriate color
   */
  private getThemedIcon(
    iconName: string,
    status: PlanStatus
  ): vscode.ThemeIcon {
    let color: vscode.ThemeColor | undefined;

    switch (status) {
      case 'completed':
        // Green checkmark - clearly indicates done
        color = new vscode.ThemeColor('charts.green');
        break;
      case 'in-progress':
        // Yellow sync icon - attention-grabbing for active work
        color = new vscode.ThemeColor('charts.yellow');
        break;
      case 'cancelled':
        // Muted gray - de-emphasizes abandoned plans
        color = new vscode.ThemeColor('disabledForeground');
        break;
      default:
        // No special color for pending - uses theme default
        color = undefined;
    }

    return new vscode.ThemeIcon(iconName, color);
  }
}

/**
 * Phase tree item - represents a single phase within a plan.
 *
 * Visual representation:
 * - Leaf node (no children, no expand arrow)
 * - Shows phase number and name: "Phase 1: Database Schema"
 * - Icon indicates phase status with coloring
 * - Click opens the phase file (or plan.md if no separate file)
 *
 * @example
 * Phase 1: Database Schema ✓
 * Phase 2: API Endpoints ⟳
 * Phase 3: Frontend ○
 */
export class PhaseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly phase: PhaseData,
    public readonly plan: PlanData   // Need parent plan for navigation
  ) {
    // === Build display label ===
    // Format: "Phase 1: Database Schema"
    const label = `Phase ${phase.phase}: ${phase.name}`;

    // Call parent constructor - None = leaf node (no children)
    super(label, vscode.TreeItemCollapsibleState.None);

    // Unique ID combining plan and phase for state persistence
    this.id = `${plan.id}-phase-${phase.phase}`;

    // === Set icon based on phase status ===
    const iconName = getPhaseStatusIcon(phase.status);
    this.iconPath = this.getThemedIcon(iconName, phase.status);

    // Simple tooltip with status and click hint
    this.tooltip = `${label}\nStatus: ${phase.status}\nClick to open`;

    // Context value for menu targeting
    this.contextValue = 'phase';

    // === Configure click behavior ===
    // Opens phase file (or plan.md if phase doesn't have separate file)
    this.command = {
      command: 'claudekit.openPhase',
      title: 'Open Phase',
      arguments: [phase, plan],  // Pass both for file resolution
    };
  }

  /**
   * Get themed icon with status-based coloring.
   * Same pattern as PlanTreeItem but for PhaseStatus.
   */
  private getThemedIcon(
    iconName: string,
    status: PhaseStatus
  ): vscode.ThemeIcon {
    let color: vscode.ThemeColor | undefined;

    switch (status) {
      case 'completed':
        color = new vscode.ThemeColor('charts.green');
        break;
      case 'in-progress':
        color = new vscode.ThemeColor('charts.yellow');
        break;
      default:
        // Pending phases use default color (circle-outline looks good plain)
        color = undefined;
    }

    return new vscode.ThemeIcon(iconName, color);
  }
}

/**
 * Info tree item - non-interactive placeholder for messages.
 *
 * Used to display:
 * - Empty state: "No plans found"
 * - Filter indicator: "Filter: Active (In Progress + Pending)"
 * - Error messages
 *
 * @example
 * ⚠ No plans found    Check ./plans directory
 */
export class InfoTreeItem extends vscode.TreeItem {
  constructor(label: string, icon: string, description?: string) {
    // Not collapsible - just a message
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    if (description) {
      this.description = description;
    }
    // Context value 'info' - not clickable, no context menu
    this.contextValue = 'info';
  }
}

// ============================================================================
// TreeDataProvider Implementation
// ============================================================================

/**
 * TreeDataProvider for ClaudeKit Plans view.
 *
 * This is the core class that powers the Explorer sidebar TreeView.
 * It implements VS Code's TreeDataProvider interface to:
 * 1. Provide tree items via getTreeItem()
 * 2. Provide hierarchy via getChildren()
 * 3. Trigger refresh via onDidChangeTreeData event
 *
 * Data Flow:
 * PlansProject → setPlans() → refresh() → VS Code re-renders tree
 *
 * @example Usage in extension.ts:
 * const provider = new PlansTreeProvider(context);
 * vscode.window.createTreeView('viewId', { treeDataProvider: provider });
 * provider.setPlans(myPlans);  // Updates the view
 */
export class PlansTreeProvider
  implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable
{
  // === State ===
  /** All plans data (set externally via setPlans) */
  private plans: PlanData[] = [];

  /** Current filter mode (persisted to workspace state) */
  private filterMode: FilterMode = 'all';

  /** Disposables for cleanup */
  private disposables: vscode.Disposable[] = [];

  // === Events ===
  /**
   * Event emitter for tree data changes.
   * VS Code listens to this event to know when to re-render the tree.
   * Firing the event with undefined refreshes the entire tree.
   */
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /**
   * Create a new TreeDataProvider.
   *
   * @param context - Extension context for state persistence (optional)
   */
  constructor(private readonly context?: vscode.ExtensionContext) {
    // Restore filter mode from workspace state (persists across sessions)
    if (context) {
      this.filterMode = context.workspaceState.get<FilterMode>('claudekit.filterMode', 'all');
    }
  }

  // === Public API ===

  /**
   * Update plans data and refresh tree.
   * Called by PlansProject when plan data changes.
   *
   * @param plans - New plans data to display
   */
  setPlans(plans: PlanData[]): void {
    this.plans = plans;
    this.refresh();
  }

  /**
   * Get current plans data.
   */
  getPlans(): PlanData[] {
    return this.plans;
  }

  /**
   * Get current filter mode.
   */
  getFilterMode(): FilterMode {
    return this.filterMode;
  }

  /**
   * Set filter mode and refresh tree.
   * Persists to workspace state for cross-session persistence.
   *
   * @param mode - New filter mode
   */
  async setFilterMode(mode: FilterMode): Promise<void> {
    this.filterMode = mode;

    // Persist to workspace state (survives window reload)
    if (this.context) {
      await this.context.workspaceState.update('claudekit.filterMode', mode);
    }

    this.refresh();
  }

  /**
   * Trigger tree refresh.
   * Fires the onDidChangeTreeData event to signal VS Code to re-render.
   */
  refresh(): void {
    // Fire with undefined to refresh entire tree
    this._onDidChangeTreeData.fire();
  }

  // === TreeDataProvider Interface Implementation ===

  /**
   * Get tree item for element.
   * VS Code calls this to get the visual representation of each element.
   *
   * Our tree items are already fully configured in their constructors,
   * so we just return them directly.
   *
   * @param element - Element to get tree item for
   * @returns The element itself (it's already a TreeItem)
   */
  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for element (hierarchy logic).
   *
   * VS Code calls this to build the tree structure:
   * - undefined element → return root items (plans + info)
   * - PlanTreeItem → return child phases
   * - PhaseTreeItem/InfoTreeItem → no children (leaf nodes)
   *
   * @param element - Parent element (undefined for root)
   * @returns Array of child elements
   */
  getChildren(element?: TreeElement): vscode.ProviderResult<TreeElement[]> {
    // === Root level ===
    // No element means VS Code is asking for root items
    if (!element) {
      return this.getRootItems();
    }

    // === Plan children ===
    // When a plan is expanded, show its phases
    if (element instanceof PlanTreeItem) {
      const plan = element.plan;

      // Handle plans with no phases
      if (plan.phases.length === 0) {
        return [new InfoTreeItem('No phases found', 'info')];
      }

      // Map phases to tree items
      return plan.phases.map((phase) => new PhaseTreeItem(phase, plan));
    }

    // === Leaf nodes ===
    // Phases and info items have no children
    return [];
  }

  /**
   * Get root level items.
   * Returns plans (filtered and sorted) or empty state message.
   *
   * @returns Array of root-level tree elements
   */
  private getRootItems(): TreeElement[] {
    // === Empty state ===
    if (this.plans.length === 0) {
      return [
        new InfoTreeItem('No plans found', 'warning', 'Check ./plans directory'),
      ];
    }

    // === Apply filter ===
    const filtered = filterPlans(this.plans, this.filterMode);

    // === Apply smart sort ===
    const sorted = [...filtered].sort(comparePlans);

    // === Handle filtered-to-empty state ===
    if (filtered.length === 0) {
      const filterLabel = FILTER_LABELS[this.filterMode];
      return [
        new InfoTreeItem(`No ${filterLabel.toLowerCase()}`, 'filter', 'Change filter to see more'),
      ];
    }

    // === Build result array ===
    const items: TreeElement[] = [];

    // Add filter indicator when filter is active
    if (this.filterMode !== 'all') {
      const filterLabel = FILTER_LABELS[this.filterMode];
      const hiddenCount = this.plans.length - filtered.length;
      items.push(
        new InfoTreeItem(`Filter: ${filterLabel}`, 'filter', `${hiddenCount} hidden`)
      );
    }

    // Add sorted plans as tree items
    items.push(...sorted.map((plan) => new PlanTreeItem(plan)));

    return items;
  }

  /**
   * Get parent of element (for reveal support).
   *
   * VS Code uses this for the reveal() functionality, which scrolls
   * to and highlights a specific tree item. We need to return the
   * parent so VS Code can expand the path to the item.
   *
   * @param element - Element to get parent of
   * @returns Parent element, or undefined if root
   */
  getParent(element: TreeElement): vscode.ProviderResult<TreeElement> {
    // Only PhaseTreeItem has a parent (its plan)
    if (element instanceof PhaseTreeItem) {
      // Find the parent plan in our data
      const plan = this.plans.find((p) => p.id === element.plan.id);
      if (plan) {
        return new PlanTreeItem(plan);
      }
    }
    // Plans and InfoItems have no parent (they're at root level)
    return undefined;
  }

  // === Disposable Implementation ===

  /**
   * Dispose resources.
   * Called when the extension is deactivated.
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._onDidChangeTreeData.dispose();
  }
}

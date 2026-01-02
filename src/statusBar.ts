/**
 * Status Bar Management
 *
 * This module manages the VS Code status bar item that shows plan progress
 * at the bottom of the VS Code window. It provides:
 * - Quick visibility of current plan progress (X/Y phases)
 * - Icon indicating plan status (check, sync, folder)
 * - Click to open the current plan.md file
 * - Auto-hide when no plans exist
 *
 * The status bar item appears on the right side, giving users a persistent
 * at-a-glance view of their current plan without needing to open the sidebar.
 *
 * @module statusBar
 */

import * as vscode from 'vscode';
import { PlanData, ProjectProgress } from './types';

/**
 * PlansStatusBar manages the status bar item for ClaudeKit.
 *
 * Responsibilities:
 * - Create and configure the status bar item
 * - Select the "current" plan to display (smart selection)
 * - Format the display text with icon and progress
 * - Build rich hover tooltips
 * - Handle show/hide visibility
 *
 * @example
 * // Create and register with extension context
 * const statusBar = new PlansStatusBar();
 * context.subscriptions.push(statusBar);
 *
 * // Update with progress data
 * statusBar.setProgress(projectProgress);
 */
export class PlansStatusBar implements vscode.Disposable {
  // === VS Code Status Bar Item ===
  /** The actual VS Code status bar item widget */
  private statusBarItem: vscode.StatusBarItem;

  // === State ===
  /** Currently displayed plan (null if no plans or hidden) */
  private currentPlan: PlanData | null = null;

  /** Full progress data from PlansProject */
  private progress: ProjectProgress | null = null;

  /**
   * Create a new PlansStatusBar.
   *
   * Sets up the status bar item with:
   * - Right alignment (appears on right side of status bar)
   * - Priority 100 (positions it among other right-aligned items)
   * - Click command to open current plan
   */
  constructor() {
    // Create status bar item on the right side
    // Priority 100 positions it towards the right but before git status (which is usually ~50)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    // Configure click behavior - runs 'claudekit.openCurrentPlan' command
    this.statusBarItem.command = 'claudekit.openCurrentPlan';

    // Default tooltip (updated when data arrives)
    this.statusBarItem.tooltip = 'Click to open current plan';
  }

  /**
   * Update with new progress data.
   *
   * Called by the extension when PlansProject detects changes.
   * Triggers a re-render of the status bar display.
   *
   * @param progress - New progress data (null to clear/hide)
   */
  setProgress(progress: ProjectProgress | null): void {
    this.progress = progress;
    this.update();  // Re-render the display
  }

  /**
   * Update the status bar display.
   *
   * This is the main rendering function that:
   * 1. Checks if there's data to display
   * 2. Selects the "current" plan using smart selection
   * 3. Formats the text with icon and progress
   * 4. Updates the tooltip
   * 5. Shows or hides the status bar item
   */
  private update(): void {
    // === Handle empty state ===
    // No progress data or no plans - hide the status bar
    if (!this.progress || this.progress.plans.length === 0) {
      this.statusBarItem.hide();
      this.currentPlan = null;
      return;
    }

    // === Select current plan ===
    // Use smart selection to find the most relevant plan
    this.currentPlan = this.findCurrentPlan();

    // === Handle no active plan ===
    // Plans exist but none are "current" (e.g., all completed)
    if (!this.currentPlan) {
      this.statusBarItem.text = '$(folder) No active plans';
      this.statusBarItem.tooltip = 'No plans in progress';
      this.statusBarItem.show();
      return;
    }

    // === Format display ===
    const plan = this.currentPlan;

    // Progress text: "3/4" (completed/total phases)
    const progressText = `${plan.completedCount}/${plan.totalCount}`;

    // Plan name, truncated to fit status bar
    const planName = this.truncate(plan.name, 20);

    // Select icon based on status
    // Using VS Code codicons: $(icon-name)
    let icon = '$(folder)';           // Default: folder icon
    if (plan.status === 'completed') {
      icon = '$(check)';              // Completed: checkmark
    } else if (plan.status === 'in-progress') {
      icon = '$(sync)';               // In progress: sync/refresh icon
    }

    // === Update status bar item ===
    // Format: "$(icon) 3/4 · my-feature"
    this.statusBarItem.text = `${icon} ${progressText} · ${planName}`;
    this.statusBarItem.tooltip = this.createTooltip();
    this.statusBarItem.show();
  }

  /**
   * Find the most relevant current plan.
   *
   * Smart selection priority:
   * 1. Plans with 'in-progress' status (actively being worked on)
   * 2. Pending plans with some completed phases (started but not marked active)
   * 3. Most recently modified plan (fall back to recent activity)
   *
   * @returns The selected current plan, or null if none found
   */
  private findCurrentPlan(): PlanData | null {
    // Guard: need progress data
    if (!this.progress) return null;

    const plans = this.progress.plans;

    // === Priority 1: Find in-progress plan ===
    // Most important - user is actively working on this
    const inProgress = plans.find((p) => p.status === 'in-progress');
    if (inProgress) return inProgress;

    // === Priority 2: Find pending plan with some progress ===
    // User started work but hasn't updated status to 'in-progress'
    const pendingWithProgress = plans.find(
      (p) => p.status === 'pending' && p.completedCount > 0
    );
    if (pendingWithProgress) return pendingWithProgress;

    // === Priority 3: Most recently modified ===
    // Fall back to showing the plan with most recent file changes
    const sorted = [...plans].sort(
      (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
    );
    return sorted[0] || null;
  }

  /**
   * Create detailed tooltip for hover display.
   *
   * Shows comprehensive information about the current plan:
   * - Plan name
   * - Progress with percentage
   * - Status and priority
   * - Effort estimate (if available)
   * - Count of other plans
   * - Click instruction
   *
   * @returns Multi-line tooltip string
   */
  private createTooltip(): string {
    // Guard: need data
    if (!this.currentPlan || !this.progress) {
      return 'No plans found';
    }

    const plan = this.currentPlan;

    // Build tooltip content line by line
    const lines: string[] = [
      // Header with plan name
      `ClaudeKit: ${plan.name}`,
      // Separator line
      '─'.repeat(30),
      // Progress details
      `Progress: ${plan.completedCount}/${plan.totalCount} phases (${plan.percentage}%)`,
      `Status: ${plan.status}`,
    ];

    // Add optional metadata
    if (plan.priority) {
      lines.push(`Priority: ${plan.priority}`);
    }

    if (plan.effort) {
      lines.push(`Effort: ${plan.effort}`);
    }

    // Show count of other plans (helps user know there's more)
    const otherPlans = this.progress.plans.length - 1;
    if (otherPlans > 0) {
      lines.push('', `+${otherPlans} other plan${otherPlans > 1 ? 's' : ''}`);
    }

    // Action hint
    lines.push('', 'Click to open plan.md');

    return lines.join('\n');
  }

  /**
   * Get current plan for use by commands.
   *
   * Used by the 'claudekit.openCurrentPlan' command to know
   * which plan to open when user clicks the status bar.
   *
   * @returns Currently displayed plan, or null if none
   */
  getCurrentPlan(): PlanData | null {
    return this.currentPlan;
  }

  /**
   * Truncate string with ellipsis for status bar display.
   *
   * Status bar space is limited, so we truncate long plan names
   * to prevent the item from taking up too much space.
   *
   * @param str - String to truncate
   * @param maxLength - Maximum length (including ellipsis)
   * @returns Truncated string with ellipsis if needed
   *
   * @example
   * truncate('my-very-long-plan-name', 15)  // returns 'my-very-long-p…'
   * truncate('short-plan', 15)              // returns 'short-plan'
   */
  private truncate(str: string, maxLength: number): string {
    // No truncation needed
    if (str.length <= maxLength) return str;

    // Truncate and add ellipsis
    // -1 to leave room for the ellipsis character
    return str.slice(0, maxLength - 1) + '…';
  }

  /**
   * Show the status bar item.
   *
   * Called by extension when showStatusBar setting is enabled.
   * Note: the update() method also calls show() when there's data,
   * so this is mainly for explicit show after hide.
   */
  show(): void {
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item.
   *
   * Called by extension when showStatusBar setting is disabled.
   */
  hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Dispose resources.
   *
   * Called when extension is deactivated. Cleans up the status bar item.
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}

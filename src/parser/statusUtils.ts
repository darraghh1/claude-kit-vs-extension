/**
 * Status utilities for plan parsing
 *
 * This module handles the messy business of converting various status
 * representations (emojis, keywords, abbreviations) into standardized
 * enum values that the rest of the extension can work with consistently.
 *
 * @module statusUtils
 */

import { PhaseStatus, PlanStatus } from '../types';

/**
 * Normalize status string to standard PhaseStatus.
 * Handles various formats: "complete", "done", "WIP", "in progress", emojis, etc.
 *
 * @param raw - Raw status string from markdown (e.g., "✅ COMPLETE", "in-progress")
 * @returns Normalized PhaseStatus enum value
 *
 * @example
 * normalizeStatus('✅ COMPLETE')  // returns 'completed'
 * normalizeStatus('WIP')          // returns 'in-progress'
 * normalizeStatus('TODO')         // returns 'pending'
 */
export function normalizeStatus(raw: string): PhaseStatus {
  // Safely handle null/undefined by converting to empty string, then lowercase
  const s = (raw || '').toLowerCase().trim();

  // Check for "completed" status indicators
  // Supports: "complete", "completed", "done", checkmarks (✓, ✅)
  if (
    s.includes('complete') ||
    s.includes('done') ||
    s.includes('✓') ||
    s.includes('✅')
  ) {
    return 'completed';
  }

  // Check for "in-progress" status indicators
  // Supports: "in-progress", "in progress", "active", "wip", sync emoji (🔄)
  if (
    s.includes('progress') ||
    s.includes('active') ||
    s.includes('wip') ||
    s.includes('🔄')
  ) {
    return 'in-progress';
  }

  // Default: anything else is treated as "pending"
  // This includes: "pending", "todo", "not started", or unknown values
  return 'pending';
}

/**
 * Calculate overall plan status from its phases.
 *
 * Status logic:
 * - All phases completed → plan is "completed"
 * - Any phase in-progress OR some completed → plan is "in-progress"
 * - No phases OR all pending → plan is "pending"
 *
 * @param phases - Array of phases with status property
 * @returns Calculated PlanStatus
 *
 * @example
 * calculatePlanStatus([{status: 'completed'}, {status: 'completed'}])  // 'completed'
 * calculatePlanStatus([{status: 'completed'}, {status: 'pending'}])    // 'in-progress'
 * calculatePlanStatus([{status: 'pending'}, {status: 'pending'}])      // 'pending'
 */
export function calculatePlanStatus(
  phases: { status: PhaseStatus }[]
): PlanStatus {
  // No phases = pending (nothing to track yet)
  if (phases.length === 0) return 'pending';

  // Check if ALL phases are completed
  const allCompleted = phases.every((p) => p.status === 'completed');
  if (allCompleted) return 'completed';

  // Check if ANY work has been done (either in-progress or some completed)
  const hasInProgress = phases.some((p) => p.status === 'in-progress');
  const hasCompleted = phases.some((p) => p.status === 'completed');

  // If any phase is actively being worked on, or some phases done but not all,
  // the overall plan is "in-progress"
  if (hasInProgress || hasCompleted) return 'in-progress';

  // Otherwise, all phases are still pending
  return 'pending';
}

/**
 * Get VS Code codicon name for phase status.
 * Used to display appropriate icons in the TreeView.
 *
 * @param status - Phase status enum value
 * @returns Codicon name (e.g., 'check', 'sync~spin', 'circle-outline')
 *
 * @see https://code.visualstudio.com/api/references/icons-in-labels
 */
export function getPhaseStatusIcon(status: PhaseStatus): string {
  switch (status) {
    case 'completed':
      return 'check';           // ✓ checkmark icon
    case 'in-progress':
      return 'sync~spin';       // Spinning sync icon (animated)
    case 'pending':
      return 'circle-outline';  // Empty circle icon
  }
}

/**
 * Get VS Code codicon name for plan status.
 * Similar to phase icons but with different icons for plan-level display.
 *
 * @param status - Plan status enum value
 * @returns Codicon name
 */
export function getPlanStatusIcon(status: PlanStatus): string {
  switch (status) {
    case 'completed':
      return 'check-all';       // Double checkmark (all done)
    case 'in-progress':
      return 'sync';            // Sync icon (non-animated for plans)
    case 'pending':
      return 'circle-outline';  // Empty circle
    case 'cancelled':
      return 'close';           // X icon for cancelled plans
  }
}

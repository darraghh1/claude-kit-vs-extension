/**
 * Core types for ClaudeKit Plans extension
 *
 * This module defines all TypeScript interfaces and types used throughout
 * the extension. Import from here when you need type definitions.
 *
 * @module types
 * @example
 * import { PlanData, PhaseData, PlanStatus } from './types';
 */

/**
 * Plan status derived from phase completion.
 * Automatically calculated from phases unless overridden in frontmatter.
 *
 * - `completed`: All phases are done
 * - `in-progress`: At least one phase is in progress or completed
 * - `pending`: No work has started
 * - `cancelled`: Plan was abandoned (set manually in frontmatter)
 */
export type PlanStatus = 'completed' | 'in-progress' | 'pending' | 'cancelled';

/**
 * Phase status from table or checkboxes.
 * Parsed from various formats like "✅ COMPLETE", "in-progress", "WIP", etc.
 */
export type PhaseStatus = 'completed' | 'in-progress' | 'pending';

/**
 * Priority levels for plans.
 * P1 = High/Critical, P2 = Medium/Normal, P3 = Low
 * null means no priority set.
 */
export type Priority = 'P1' | 'P2' | 'P3' | null;

/**
 * Parsed phase data from plan.md.
 * Represents a single phase/step within a plan.
 *
 * @example
 * const phase: PhaseData = {
 *   phase: 1,
 *   name: 'Database Schema',
 *   status: 'completed',
 *   file: '/path/to/phase-01-database.md',
 *   linkText: 'Phase 1',
 *   effort: '4h'
 * };
 */
export interface PhaseData {
  /** Phase number (1, 2, 3, etc.) */
  phase: number;
  /** Human-readable phase name */
  name: string;
  /** Current status of this phase */
  status: PhaseStatus;
  /** Absolute path to phase detail file (or plan.md if no separate file) */
  file: string;
  /** Text shown in markdown link, e.g., "Phase 1" or "Database Setup" */
  linkText: string;
  /** Estimated effort, e.g., "4h", "2d" */
  effort?: string;
}

/**
 * Parsed plan metadata from frontmatter + content.
 * This is the main data structure representing a complete plan.
 *
 * @example
 * const plan: PlanData = {
 *   id: '260101-feature-auth',
 *   name: 'Feature Auth',
 *   path: '/workspace/plans/260101-feature-auth/plan.md',
 *   status: 'in-progress',
 *   phases: [...],
 *   completedCount: 3,
 *   totalCount: 8,
 *   percentage: 37,
 *   lastModified: new Date(),
 *   priority: 'P1',
 *   description: 'Implement user authentication system'
 * };
 */
export interface PlanData {
  /** Unique identifier (directory name, e.g., "260101-feature-auth") */
  id: string;
  /** Display name (from frontmatter or derived from id) */
  name: string;
  /** Absolute path to plan.md file */
  path: string;
  /** Overall plan status */
  status: PlanStatus;
  /** Array of phases parsed from plan.md */
  phases: PhaseData[];
  /** Number of completed phases */
  completedCount: number;
  /** Total number of phases */
  totalCount: number;
  /** Completion percentage (0-100) */
  percentage: number;
  /** Last modification time of plan.md */
  lastModified: Date;
  /** Short description from frontmatter or Overview section */
  description?: string;
  /** Priority level (P1/P2/P3) */
  priority?: Priority;
  /** Tags for categorization */
  tags?: string[];
  /** GitHub issue number or URL */
  issue?: string;
  /** Git branch name */
  branch?: string;
  /** Total estimated effort */
  effort?: string;
  /** When the plan was created */
  createdDate?: Date;
  /** When the plan was completed */
  completedDate?: Date;
}

/**
 * Project-level state for a workspace folder.
 * Aggregates progress across all plans in a workspace.
 */
export interface ProjectProgress {
  /** Absolute path to workspace root */
  rootPath: string;
  /** Workspace folder name */
  projectName: string;
  /** All plans in this workspace */
  plans: PlanData[];
  /** Sum of all phases across all plans */
  totalPhases: number;
  /** Sum of completed phases across all plans */
  completedPhases: number;
  /** Overall completion percentage */
  percentage: number;
}

/**
 * Extension settings from VS Code configuration.
 * Configured via Settings UI or settings.json under "claudekit.*".
 *
 * @example
 * // In settings.json:
 * {
 *   "claudekit.plansPath": "./plans",
 *   "claudekit.showStatusBar": true,
 *   "claudekit.autoRefresh": true
 * }
 */
export interface ExtensionSettings {
  /** Path to plans directory relative to workspace root */
  plansPath: string;
  /** Whether to show status bar item */
  showStatusBar: boolean;
  /** Whether to auto-refresh on file changes */
  autoRefresh: boolean;
}

/**
 * Result of scanning a plans directory.
 * Used internally by the scanner module.
 */
export interface ScanResult {
  /** Successfully parsed plans */
  plans: PlanData[];
  /** Error messages for plans that failed to parse */
  errors: string[];
}

/**
 * Frontmatter data extracted from plan.md.
 * YAML block at the top of the file between --- markers.
 *
 * @example
 * ---
 * title: Feature Authentication
 * priority: P1
 * status: in-progress
 * branch: feature/auth
 * tags: [security, backend]
 * ---
 */
export interface PlanFrontmatter {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  effort?: string;
  branch?: string;
  tags?: string[];
  created?: string;
  completed?: string;
}

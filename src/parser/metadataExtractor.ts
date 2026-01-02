/**
 * Metadata Extractor - extracts rich metadata from plan.md files
 *
 * This module is responsible for pulling out all the metadata from a plan file,
 * including information from YAML frontmatter, markdown headers, and directory names.
 *
 * Metadata extraction happens in layers with cascading priority:
 * 1. YAML frontmatter (highest priority) - structured data at top of file
 * 2. Markdown headers - **Key:** Value patterns in the document
 * 3. Directory name - date extracted from YYMMDD-name pattern
 * 4. Defaults - calculated or fallback values
 *
 * This layered approach allows plans to work with minimal markup while
 * supporting rich metadata for those who want it.
 *
 * @module metadataExtractor
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';  // Library for parsing YAML frontmatter
import { PlanData, PlanStatus, Priority } from '../types';
import { parsePlanTable } from './planParser';
import { calculatePlanStatus } from './statusUtils';
import { getPlanId, getPlanDisplayName } from './planScanner';

/**
 * Normalize priority to standardized P1/P2/P3 format.
 *
 * Users might write priorities in various ways:
 * - Numeric: P1, P2, P3
 * - Words: High, Medium, Low
 * - Variations: Critical, Normal
 *
 * This function converts all variants to a consistent format.
 *
 * @param priority - Raw priority string from frontmatter or header
 * @returns Normalized Priority (P1/P2/P3) or null if not recognized
 *
 * @example
 * normalizePriority('P1')       // returns 'P1'
 * normalizePriority('high')     // returns 'P1'
 * normalizePriority('medium')   // returns 'P2'
 * normalizePriority('invalid')  // returns null
 */
export function normalizePriority(priority: string | undefined): Priority {
  // No priority provided - return null (not "unknown", null means "not set")
  if (!priority) return null;

  // Normalize to uppercase for consistent comparison
  const p = String(priority).toUpperCase().trim();

  // P1 / High priority - critical, urgent work
  if (p === 'P1' || p === 'HIGH' || p === 'CRITICAL') return 'P1';

  // P2 / Medium priority - normal, standard work
  if (p === 'P2' || p === 'MEDIUM' || p === 'NORMAL') return 'P2';

  // P3 / Low priority - nice-to-have, when time permits
  if (p === 'P3' || p === 'LOW') return 'P3';

  // Direct P0-P3 format (P0 treated same as P1 for display)
  if (p.match(/^P[0-3]$/)) return p as Priority;

  // Unrecognized format
  return null;
}

/**
 * Parse date from directory name (YYMMDD or YYYYMMDD format).
 *
 * Plan directories are named with date prefixes for chronological sorting:
 * - YYMMDD-name: "260101-feature-auth" → January 1, 2026
 * - YYMMDD-HHMM-name: "260101-1430-quick-fix" → January 1, 2026
 * - YYYYMMDD-name: "20260101-feature" → January 1, 2026
 *
 * The date becomes the plan's created date if not specified in frontmatter.
 *
 * @param dirName - Directory name (e.g., "260101-feature-auth")
 * @returns Parsed Date object, or undefined if no date found
 *
 * @example
 * parseDateFromDirName('260101-feature')      // returns Date(2026, 0, 1)
 * parseDateFromDirName('20260101-feature')    // returns Date(2026, 0, 1)
 * parseDateFromDirName('my-feature')          // returns undefined
 */
export function parseDateFromDirName(dirName: string): Date | undefined {
  // Regex to match date prefix at start of directory name
  // ^(\d{6,8})   - 6 or 8 digits (YYMMDD or YYYYMMDD)
  // (?:-(\d{4}))? - optional time component (HHMM)
  // -            - separator before the rest of the name
  const match = dirName.match(/^(\d{6,8})(?:-(\d{4}))?-/);
  if (!match) return undefined;

  const dateStr = match[1];
  let year: number, month: number, day: number;

  if (dateStr.length === 6) {
    // === YYMMDD format ===
    // First 2 digits: year (00-99 → 2000-2099)
    // Next 2 digits: month (01-12)
    // Last 2 digits: day (01-31)
    year = 2000 + parseInt(dateStr.slice(0, 2), 10);
    month = parseInt(dateStr.slice(2, 4), 10) - 1;  // JS months are 0-indexed
    day = parseInt(dateStr.slice(4, 6), 10);
  } else {
    // === YYYYMMDD format ===
    // First 4 digits: full year
    // Next 2 digits: month
    // Last 2 digits: day
    year = parseInt(dateStr.slice(0, 4), 10);
    month = parseInt(dateStr.slice(4, 6), 10) - 1;  // JS months are 0-indexed
    day = parseInt(dateStr.slice(6, 8), 10);
  }

  // Construct the Date object
  const date = new Date(year, month, day);

  // Validate the date is real (catches things like Feb 31)
  return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Parse effort string to hours for aggregation.
 *
 * Effort estimates can be written in various formats:
 * - Hours: "4h", "4 hours", "4hr"
 * - Minutes: "30m", "30 min", "30 minutes"
 * - Days: "2d", "2 days" (assumes 8-hour work day)
 *
 * This function normalizes all formats to decimal hours.
 *
 * @param effortStr - Raw effort string (e.g., "4h", "30m", "2d")
 * @returns Effort in hours (0 if unparseable)
 *
 * @example
 * parseEffortToHours('4h')       // returns 4
 * parseEffortToHours('30m')      // returns 0.5
 * parseEffortToHours('2d')       // returns 16 (2 × 8 hours)
 * parseEffortToHours('invalid')  // returns 0
 */
export function parseEffortToHours(effortStr: string | undefined): number {
  // No effort string provided
  if (!effortStr) return 0;

  // Normalize to lowercase for consistent matching
  const str = effortStr.toLowerCase().trim();

  // === Hours format ===
  // Matches: 4h, 4 hours, 4hr, 1.5h, 1.5 hours
  const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:h|hours?|hrs?)/);
  if (hoursMatch) return parseFloat(hoursMatch[1]);

  // === Minutes format ===
  // Matches: 30m, 30 min, 30 minutes
  // Convert to hours by dividing by 60
  const minutesMatch = str.match(/(\d+)\s*(?:m|min|minutes?)/);
  if (minutesMatch) return parseInt(minutesMatch[1], 10) / 60;

  // === Days format ===
  // Matches: 2d, 2 days, 1.5d
  // Assume 8-hour work day for conversion
  const daysMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:d|days?)/);
  if (daysMatch) return parseFloat(daysMatch[1]) * 8;

  // No recognized format - return 0
  return 0;
}

/**
 * Normalize status string from metadata to PlanStatus enum.
 *
 * This is specifically for status values from frontmatter/headers,
 * not for phase status values (use statusUtils.normalizeStatus for those).
 *
 * @param status - Raw status string from metadata
 * @returns Normalized PlanStatus
 */
function normalizeMetadataStatus(status: string | undefined): PlanStatus {
  // No status provided - default to pending
  if (!status) return 'pending';

  // Normalize to lowercase for comparison
  const s = String(status).toLowerCase().trim();

  // Completed states
  if (s === 'complete' || s === 'completed' || s === 'done') return 'completed';

  // In-progress states (various formats)
  if (
    s === 'in-progress' ||
    s === 'in_progress' ||
    s === 'active' ||
    s === 'wip'
  )
    return 'in-progress';

  // Cancelled states
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';

  // Default to pending for unrecognized values
  return 'pending';
}

/**
 * Extract metadata from YAML frontmatter.
 *
 * YAML frontmatter is the preferred way to add metadata to plans.
 * It's the block at the top of the file between --- markers:
 *
 * ---
 * title: My Feature Plan
 * priority: P1
 * status: in-progress
 * tags: [feature, backend]
 * ---
 *
 * @param content - Full file content
 * @returns Partial PlanData with extracted fields, or null if no frontmatter
 */
function extractFromFrontmatter(content: string): Partial<PlanData> | null {
  // Quick check: frontmatter must start at the very beginning
  if (!content || !content.trim().startsWith('---')) return null;

  try {
    // Use gray-matter library to parse YAML frontmatter
    // It handles edge cases like nested objects, arrays, etc.
    const { data } = matter(content);

    // No data or empty object - treat as no frontmatter
    if (!data || Object.keys(data).length === 0) return null;

    // Extract and normalize each field
    return {
      name: data.title || undefined,
      description: data.description || undefined,
      status: normalizeMetadataStatus(data.status),
      priority: normalizePriority(data.priority),
      effort: data.effort || undefined,
      // Tags should be an array; default to empty if not
      tags: Array.isArray(data.tags) ? data.tags : [],
      branch: data.branch || undefined,
      // Issue might be a number in YAML, convert to string
      issue: data.issue ? String(data.issue) : undefined,
      // Dates: gray-matter may parse them as Date objects already
      createdDate: data.created ? new Date(data.created) : undefined,
      completedDate: data.completed ? new Date(data.completed) : undefined,
    };
  } catch {
    // YAML parse error (malformed frontmatter)
    // Return null to fall back to header extraction
    return null;
  }
}

/**
 * Extract metadata from markdown header section (regex fallback).
 *
 * When there's no YAML frontmatter, we can still extract metadata
 * from markdown patterns like:
 *
 * **Priority:** P1
 * **Status:** In Progress
 * **Branch:** `feature/auth`
 *
 * This only looks at the first ~50 lines to avoid false matches
 * in the main content.
 *
 * @param content - Full file content
 * @returns Partial PlanData with extracted fields
 */
function extractFromHeader(content: string): Partial<PlanData> {
  const result: Partial<PlanData> = {};

  // Only examine the header section (first 50 lines)
  // This prevents matching patterns in the main content
  const headerSection = content.split('\n').slice(0, 50).join('\n');

  // === Priority extraction ===
  // Matches: **Priority:** P1, **Priority**: High
  const priorityMatch = headerSection.match(
    /\*\*Priority:?\*\*:?\s*(P[0-3]|High|Medium|Low)/i
  );
  if (priorityMatch) {
    result.priority = normalizePriority(priorityMatch[1]);
  }

  // === Status extraction ===
  // Matches: **Status:** Complete, **Status**: In Progress
  // [^\n(]+ captures until newline or parenthesis (for things like "(50%)")
  const statusMatch = headerSection.match(
    /\*\*Status:?\*\*:?\s*([^\n(]+)/i
  );
  if (statusMatch) {
    result.status = normalizeMetadataStatus(statusMatch[1].trim());
  }

  // === Branch extraction ===
  // Matches: **Branch:** `branch-name`, **Branch:** branch-name
  // Handles optional backticks around the branch name
  const branchMatch = headerSection.match(
    /\*\*Branch:?\*\*:?\s*`?([^`\n]+)`?/i
  );
  if (branchMatch) {
    result.branch = branchMatch[1].trim();
  }

  // === Issue extraction ===
  // Matches: **Issue:** #74, **Issue:** https://github.com/org/repo/issues/74
  const issueMatch = headerSection.match(
    /\*\*Issue:?\*\*:?\s*(?:#(\d+)|.*?issues\/(\d+))/i
  );
  if (issueMatch) {
    // Use first capture group (#number) or second (URL number)
    result.issue = issueMatch[1] || issueMatch[2];
  }

  // === Created date extraction ===
  // Matches: **Created:** 2025-12-01, **Date:** 2025-12-01
  const createdMatch = headerSection.match(
    /\*\*(?:Created|Date):?\*\*:?\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (createdMatch) {
    result.createdDate = new Date(createdMatch[1]);
  }

  return result;
}

/**
 * Extract description from ## Overview section.
 *
 * Many plans have an "Overview" section that provides a good
 * summary/description. We extract the first sentence (or first
 * 150 characters) for use in tooltips and summaries.
 *
 * @param content - Full file content
 * @returns Description string, or undefined if no Overview section
 *
 * @example
 * // Given content with:
 * // ## Overview
 * // This plan implements user authentication. It covers login, logout...
 *
 * extractDescription(content)  // returns "This plan implements user authentication."
 */
function extractDescription(content: string): string | undefined {
  // Look for "## Overview" heading followed by paragraph text
  // [^\n#]+ matches text until next heading or end
  const overviewMatch = content.match(/##\s*Overview\s*\n+([^\n#]+)/i);
  if (overviewMatch) {
    const desc = overviewMatch[1].trim();

    // Try to get just the first sentence for a cleaner summary
    // Matches: text followed by . ! or ?
    const firstSentence = desc.match(/^[^.!?]+[.!?]/);
    if (firstSentence) return firstSentence[0].trim();

    // Fall back to first 150 characters if no clear sentence boundary
    return desc.slice(0, 150).trim();
  }

  // No Overview section found
  return undefined;
}

/**
 * Extract complete plan data from a plan.md file.
 *
 * This is the main entry point for metadata extraction. It:
 * 1. Reads the file
 * 2. Parses phases using planParser
 * 3. Extracts metadata from frontmatter (primary) and headers (fallback)
 * 4. Merges all data into a complete PlanData object
 *
 * @param planPath - Absolute path to plan.md file
 * @returns Complete PlanData object with all metadata
 *
 * @example
 * const planData = extractPlanData('/workspace/plans/260101-feature/plan.md');
 * console.log(planData.name);       // "Feature Auth"
 * console.log(planData.percentage); // 75
 * console.log(planData.priority);   // "P1"
 */
export async function extractPlanData(planPath: string): Promise<PlanData> {
  // === Step 1: Read file and get filesystem stats ===
  const content = await fs.promises.readFile(planPath, 'utf8');
  const stats = await fs.promises.stat(planPath); // For last modified time

  // Get the plan ID from the directory name
  // e.g., "/workspace/plans/260101-feature/plan.md" → "260101-feature"
  const planId = getPlanId(planPath);

  // === Step 2: Parse phases from the plan content ===
  // This gives us the actual work items and their statuses
  const phases = await parsePlanTable(planPath);

  // === Step 3: Extract metadata from various sources ===
  // Frontmatter has highest priority
  const frontmatter = extractFromFrontmatter(content);

  // Header patterns are fallback when frontmatter is absent
  const headerMeta = extractFromHeader(content);

  // Directory name date is fallback for created date
  const dirDate = parseDateFromDirName(planId);

  // === Step 4: Calculate progress statistics ===
  const completedCount = phases.filter((p) => p.status === 'completed').length;
  const totalCount = phases.length;

  // Calculate status from phases if not explicitly set in frontmatter
  const calculatedStatus = calculatePlanStatus(phases);

  // === Step 5: Build and return complete PlanData ===
  // Priority order for each field: frontmatter > header > calculated/default
  return {
    // Identity
    id: planId,
    name:
      frontmatter?.name || headerMeta.name || getPlanDisplayName(planId),
    path: planPath,

    // Status - frontmatter overrides calculated
    status: frontmatter?.status || headerMeta.status || calculatedStatus,

    // Phase data
    phases,
    completedCount,
    totalCount,
    percentage:
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,

    // Timestamps
    lastModified: stats.mtime,

    // === Enhanced metadata ===
    // These fields are optional and may be undefined

    description: frontmatter?.description || extractDescription(content),
    priority: frontmatter?.priority || headerMeta.priority || null,
    tags: frontmatter?.tags || [],
    issue: frontmatter?.issue || headerMeta.issue,
    branch: frontmatter?.branch || headerMeta.branch,
    effort: frontmatter?.effort,

    // Dates - frontmatter > header > directory name
    createdDate: frontmatter?.createdDate || headerMeta.createdDate || dirDate,
    completedDate: frontmatter?.completedDate || headerMeta.completedDate,
  };
}

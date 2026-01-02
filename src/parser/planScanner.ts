/**
 * Plan Scanner - discovers plan.md files in directory
 *
 * This module is responsible for finding all plan.md files within
 * the plans directory structure. It expects the following layout:
 *
 * plans/
 * ├── 260101-feature-auth/
 * │   └── plan.md              ← This gets found
 * ├── 260102-bug-fix/
 * │   └── plan.md              ← This gets found
 * └── some-file.md             ← This is ignored (not in subdirectory)
 *
 * @module planScanner
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Scan directory for plan.md files.
 *
 * Looks for the pattern: {plansDir}/{subdirectory}/plan.md
 * Only finds plan.md files that are exactly one level deep.
 *
 * @param plansDir - Absolute path to plans directory (e.g., "/workspace/plans")
 * @returns Array of absolute paths to plan.md files, sorted newest first
 *
 * @example
 * scanPlansDirectory('/workspace/plans')
 * // Returns: ['/workspace/plans/260102-latest/plan.md', '/workspace/plans/260101-older/plan.md']
 */
export async function scanPlansDirectory(plansDir: string): Promise<string[]> {
  // Will hold all discovered plan.md paths
  const planFiles: string[] = [];

  // Guard: if plans directory doesn't exist, return empty array
  // Using access to check existence (will throw if not exists)
  try {
    await fs.promises.access(plansDir);
  } catch {
    return planFiles;
  }

  // Read all entries in the plans directory
  // withFileTypes: true gives us Dirent objects so we can check if it's a directory
  const entries = await fs.promises.readdir(plansDir, { withFileTypes: true });

  // Iterate through each entry looking for subdirectories
  for (const entry of entries) {
    // Skip files at root level - we only want directories
    // e.g., skip "plans/readme.md", only process "plans/260101-feature/"
    if (!entry.isDirectory()) continue;

    // Construct the expected plan.md path within this subdirectory
    const planMdPath = path.join(plansDir, entry.name, 'plan.md');

    // Check if plan.md exists in this subdirectory
    try {
      await fs.promises.access(planMdPath);
      planFiles.push(planMdPath);
    } catch {
      // File doesn't exist, skip
    }
  }

  // Sort by directory name in descending order (newest first)
  // Since directory names are prefixed with YYMMDD (e.g., "260102-feature"),
  // reverse alphabetical order puts the most recent dates first
  planFiles.sort((a, b) => {
    const dirA = path.basename(path.dirname(a)); // Extract directory name
    const dirB = path.basename(path.dirname(b));
    return dirB.localeCompare(dirA);             // Descending order
  });

  return planFiles;
}

/**
 * Extract plan ID from a plan.md file path.
 *
 * The plan ID is simply the name of the directory containing plan.md.
 * This ID is used as a unique identifier throughout the extension.
 *
 * @param planPath - Absolute path to plan.md file
 * @returns Directory name (e.g., "260101-feature-auth")
 *
 * @example
 * getPlanId('/workspace/plans/260101-feature-auth/plan.md')
 * // Returns: '260101-feature-auth'
 */
export function getPlanId(planPath: string): string {
  // path.dirname() gets the parent directory: "/workspace/plans/260101-feature-auth"
  // path.basename() gets just the final component: "260101-feature-auth"
  return path.basename(path.dirname(planPath));
}

/**
 * Generate human-readable display name from plan ID.
 *
 * Converts kebab-case directory names to Title Case, removing the date prefix.
 * This is used when the plan doesn't have a title in its frontmatter.
 *
 * @param planId - Directory name (e.g., "260101-feature-auth")
 * @returns Human-readable name (e.g., "Feature Auth")
 *
 * @example
 * getPlanDisplayName('260101-feature-auth')     // Returns: 'Feature Auth'
 * getPlanDisplayName('260101-1430-quick-fix')   // Returns: 'Quick Fix'
 * getPlanDisplayName('my-plan')                 // Returns: 'My Plan'
 */
export function getPlanDisplayName(planId: string): string {
  // Remove date prefix from the beginning of the string
  // Handles two formats:
  // - YYMMDD-name       → "260101-feature" becomes "feature"
  // - YYMMDD-HHMM-name  → "260101-1430-feature" becomes "feature"
  const withoutDate = planId.replace(/^\d{6}(-\d{4})?-/, '');

  // Convert kebab-case to Title Case
  // Split by hyphens, capitalize each word, join with spaces
  // "feature-auth" → ["feature", "auth"] → ["Feature", "Auth"] → "Feature Auth"
  return withoutDate
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

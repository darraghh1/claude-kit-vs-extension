/**
 * Plan Parser - extracts phase metadata from plan.md files
 *
 * This is the core parsing engine that extracts phase information from markdown
 * plan files. It's designed to be flexible and handle multiple table/list formats
 * that users might create their plans in.
 *
 * Supported formats (in order of detection priority):
 * 1. Multi-column table with Status column and optional Link column
 * 2. Link-first table: | [Phase X](path) | Description | Status |
 * 3. Numbered list with inline status: 1. **Name** - ✅ COMPLETE
 * 4. Heading-based: ### Phase X: Name with - Status: below
 * 5. Checkbox list with links: - [x] **[Phase 1](path)**
 *
 * The parser tries each format in sequence until one returns results.
 * This allows plans to use whichever format is most convenient.
 *
 * @module planParser
 */

import * as fs from 'fs';
import * as path from 'path';
import { PhaseData, PhaseStatus } from '../types';
import { normalizeStatus } from './statusUtils';
import { extractPhaseMetadata } from './phaseMetadataExtractor';

/**
 * Keywords that indicate a valid status value.
 *
 * When parsing tables, we need to identify which column contains status data.
 * This list includes all recognized status keywords and emojis that users
 * might use to indicate phase completion state.
 *
 * The parser checks if a table cell contains any of these keywords to
 * determine if it's a status column vs. a name or description column.
 */
const STATUS_KEYWORDS = [
  // Text-based status values (case-insensitive matching)
  'pending',       // Not started
  'in-progress',   // Work in progress (hyphenated)
  'in progress',   // Work in progress (space-separated)
  'completed',     // Finished
  'complete',      // Finished (alternative)
  'done',          // Finished (alternative)
  'cancelled',     // Abandoned (US spelling)
  'canceled',      // Abandoned (UK spelling)
  'todo',          // Not started (alternative)
  'wip',           // Work In Progress (abbreviation)
  'planned',       // Scheduled but not started
  'not started',   // Explicit not started
  'not-started',   // Explicit not started (hyphenated)

  // Emoji status indicators
  '✅',  // Checkmark - completed
  '⏳',  // Hourglass - in progress/waiting
  '🔄',  // Arrows - in progress/updating
  '❌',  // X mark - cancelled/blocked
  '○',   // Empty circle - pending
  '⟳',   // Rotating arrows - in progress
  '✓',   // Simple checkmark - completed
];

/**
 * Check if a string looks like a valid status value.
 *
 * This function is used when parsing table rows to determine if a cell
 * contains status information. It's case-insensitive and checks for
 * partial matches (e.g., "✅ COMPLETE" contains "complete").
 *
 * @param text - The text to check (typically a table cell value)
 * @returns true if the text contains a recognized status keyword
 *
 * @example
 * isValidStatus('✅ COMPLETE')    // true - contains "complete"
 * isValidStatus('In Progress')    // true - contains "in progress"
 * isValidStatus('Database Setup') // false - no status keyword
 */
function isValidStatus(text: string): boolean {
  // Convert to lowercase for case-insensitive matching
  const lower = text.toLowerCase().trim();

  // Check if ANY of our status keywords appear in the text
  // Using .some() for short-circuit evaluation (stops at first match)
  return STATUS_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Main entry point: Parse a plan.md file to extract phase metadata.
 *
 * This function orchestrates the parsing process by trying each format
 * parser in sequence. The order is important - more specific/structured
 * formats are tried first before falling back to simpler patterns.
 *
 * @param planFilePath - Absolute path to the plan.md file
 * @returns Array of PhaseData objects, empty if no phases found
 *
 * @example
 * const phases = parsePlanTable('/workspace/plans/260101-feature/plan.md');
 * // Returns: [{ phase: 1, name: 'Setup', status: 'completed', ... }, ...]
 */
export async function parsePlanTable(planFilePath: string): Promise<PhaseData[]> {
  // Read the entire file content into memory
  const content = await fs.promises.readFile(planFilePath, 'utf8');

  // Get the directory containing the plan file - needed to resolve relative links
  // e.g., "./phase-01.md" needs to be resolved relative to plan.md's location
  const dir = path.dirname(planFilePath);

  // Will hold the parsed phases - initialized as empty
  let phases: PhaseData[] = [];

  // === Try each format in order of specificity ===
  // We try the most structured formats first (tables with clear columns)
  // and fall back to looser formats (numbered lists, headings)

  // Format 1: Multi-column markdown table with Status column
  // This is the most common format: | # | Phase | Status | Link |
  phases = parseMultiColumnTable(content, dir, planFilePath);
  if (phases.length > 0) {
    return enrichPhasesWithFileMetadata(phases);
  }

  // Format 2: Link-first table style
  // | [Phase 1](./phase-01.md) | Description | Status |
  phases = parseLinkFirstTable(content, dir);
  if (phases.length > 0) {
    return enrichPhasesWithFileMetadata(phases);
  }

  // Format 3: Numbered markdown list with inline status
  // 1. **Database Schema** - ✅ COMPLETE
  phases = parseNumberedListWithStatus(content, planFilePath);
  if (phases.length > 0) {
    return enrichPhasesWithFileMetadata(phases);
  }

  // Format 4: Heading-based with status on separate line
  // ### Phase 1: Setup
  // - Status: Completed
  phases = parseHeadingBased(content, planFilePath);
  if (phases.length > 0) {
    return enrichPhasesWithFileMetadata(phases);
  }

  // Format 5: Checkbox list (GitHub task list style)
  // - [x] **[Phase 1: Setup](./phase-01.md)**
  phases = parseCheckboxList(content, dir, planFilePath);
  if (phases.length > 0) {
    return enrichPhasesWithFileMetadata(phases);
  }

  // No format matched - return empty array
  return phases;
}

/**
 * Enrich phases with metadata from their linked phase files.
 *
 * When a phase links to a separate file (e.g., phase-01-setup.md),
 * we read that file and extract its Implementation Status. This
 * provides an authoritative status that overrides the plan.md table.
 *
 * WHY THIS MATTERS:
 * The phase file contains detailed implementation info. Its status
 * is the "source of truth" - the plan.md table is just a summary.
 *
 * @param phases - Phases parsed from plan.md
 * @returns Phases with updated status from their linked files
 */
async function enrichPhasesWithFileMetadata(
  phases: PhaseData[]
): Promise<PhaseData[]> {
  // Process all phases in parallel for performance
  const enrichedPhases = await Promise.all(
    phases.map(async (phase) => {
      // Only check files that look like phase files (not plan.md itself)
      if (!phase.file || !phase.file.includes('phase-')) {
        return phase;
      }

      try {
        // Extract metadata from the phase file
        const metadata = await extractPhaseMetadata(phase.file);

        if (metadata) {
          // Phase file has metadata - use its status as authoritative
          return {
            ...phase,
            status: metadata.status,
            // Optionally update effort if present in phase file
            effort: metadata.effort || phase.effort,
          };
        }
      } catch {
        // File read failed - keep original status from plan.md
        // This is not an error - phase files may not exist yet
      }

      return phase;
    })
  );

  return enrichedPhases;
}

/**
 * Format 1: Multi-column table with Status column
 *
 * This parser handles the most common markdown table format with
 * explicit column headers. It's flexible about column order and
 * which columns are present.
 *
 * Supported table structures:
 * - | # | Phase | Description | Effort | Status | Link |
 * - | Phase | Name | Status | [Link](path) |
 * - | Phase Name | Status |
 *
 * The parser scans ALL tables in the file looking for one that has both
 * a Status column AND a Phase-related column. This prevents parsing
 * non-phase tables like "Gap Analysis" that happen to have Status columns.
 *
 * @param content - Full markdown file content
 * @param dir - Directory containing the plan.md (for resolving links)
 * @param planFilePath - Absolute path to plan.md (fallback for phase file)
 * @returns Array of parsed phases
 */
function parseMultiColumnTable(
  content: string,
  dir: string,
  planFilePath: string
): PhaseData[] {
  const lines = content.split('\n');

  // Scan through ALL tables, not just the first one with Status column
  // This is needed because plans may have non-phase tables (like "Gap Analysis")
  // that also have a Status column but shouldn't be parsed as phases
  let scanStartLine = 0;

  while (scanStartLine < lines.length) {
    const result = parseTableStartingFrom(lines, scanStartLine, dir, planFilePath);

    if (result.phases.length > 0) {
      // Found a valid phase table
      return result.phases;
    }

    if (result.nextScanLine <= scanStartLine) {
      // No more tables found
      break;
    }

    // Continue scanning from after this table
    scanStartLine = result.nextScanLine;
  }

  return [];
}

/**
 * Parse a single table starting from a given line.
 *
 * @returns Object with phases array and next line to scan from
 */
function parseTableStartingFrom(
  lines: string[],
  startLine: number,
  dir: string,
  planFilePath: string
): { phases: PhaseData[]; nextScanLine: number } {
  const phases: PhaseData[] = [];

  // === Column index tracking ===
  let headerIndex = -1;
  let statusColIndex = -1;
  let phaseColIndex = -1;
  let nameColIndex = -1;
  let descColIndex = -1;
  let linkColIndex = -1;

  // === Step 1: Find the header row ===
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];

    if (!line.includes('|')) continue;

    const cols = line
      .split('|')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c);

    const statusIdx = cols.findIndex(
      (c) => c === 'status' || c.includes('status')
    );

    if (statusIdx !== -1) {
      headerIndex = i;
      statusColIndex = statusIdx;

      const numberColIndex = cols.findIndex((c) => c === '#' || c === 'order');
      const phaseNameColIndex = cols.findIndex((c) => c === 'phase' || c === 'phase name');

      if (numberColIndex !== -1 && phaseNameColIndex !== -1) {
        phaseColIndex = numberColIndex;
        nameColIndex = phaseNameColIndex;
      } else if (phaseNameColIndex !== -1) {
        phaseColIndex = phaseNameColIndex;
      } else {
        phaseColIndex = numberColIndex;
      }

      if (nameColIndex === -1) {
        nameColIndex = cols.findIndex(
          (c) => c === 'name' || c === 'title' || c === 'phase name'
        );
      }

      descColIndex = cols.findIndex(
        (c) => c === 'description' || c === 'desc'
      );

      linkColIndex = cols.findIndex((c) => c === 'link' || c === 'file');
      break;
    }
  }

  // No Status column found
  if (headerIndex === -1 || statusColIndex === -1) {
    return { phases: [], nextScanLine: lines.length };
  }

  // Skip tables without a Phase-related column - they're probably not phase tables
  // This prevents parsing things like "Gap Analysis" tables that have Status columns
  if (phaseColIndex === -1 && nameColIndex === -1 && descColIndex === -1) {
    // Return the line AFTER this table so we can continue scanning
    let nextLine = headerIndex + 1;
    while (nextLine < lines.length && lines[nextLine].includes('|')) {
      nextLine++;
    }
    return { phases: [], nextScanLine: nextLine };
  }

  // === Step 2: Parse data rows ===
  // Start from the line after the header and process until we hit a non-table line
  let tableEndLine = headerIndex + 1;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    tableEndLine = i + 1;

    // End of table - no more pipe characters
    if (!line.includes('|')) break;

    // Skip the separator row (e.g., |---|---|---|)
    if (line.includes('---') || line.includes('===')) continue;

    // Split into columns (same process as header)
    const cols = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c);

    // Skip rows that don't have enough columns
    if (cols.length <= statusColIndex) continue;

    // Extract and validate status
    const statusText = cols[statusColIndex];
    if (!isValidStatus(statusText)) continue;  // Skip non-phase rows

    // === Extract phase number ===
    // Default to sequential numbering if no number found
    let phaseNum = phases.length + 1;
    if (phaseColIndex !== -1 && cols[phaseColIndex]) {
      // Look for any digits in the phase column
      // Handles: "1", "Phase 1", "01", etc.
      const numMatch = /(\d+)/.exec(cols[phaseColIndex]);
      if (numMatch) phaseNum = parseInt(numMatch[1], 10);
    }

    // === Extract phase name ===
    // Priority: Description > Name > Phase column content
    let name = '';
    if (descColIndex !== -1 && cols[descColIndex]) {
      // Prefer description column if available
      name = cols[descColIndex];
    } else if (nameColIndex !== -1 && cols[nameColIndex]) {
      // Fall back to explicit name column
      name = cols[nameColIndex];
    } else if (phaseColIndex !== -1 && cols[phaseColIndex]) {
      // Last resort: try to extract name from phase column
      const phaseText = cols[phaseColIndex];

      // Check if the phase column contains a markdown link
      // e.g., "[Database Setup](./phase-01.md)"
      const linkMatch = /\[([^\]]+)\]\([^)]+\)/.exec(phaseText);
      if (linkMatch) {
        // Use the link text as the name
        name = linkMatch[1];
      } else if (!/^\d+$/.test(phaseText)) {
        // Only use if it's not just a number
        name = phaseText;
      }
    }

    // Clean up name: remove markdown bold and extract text from links
    // "**[Name](path)**" → "Name"
    name = name.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Fallback name if still empty
    if (!name) name = `Phase ${phaseNum}`;

    // === Extract link to phase file ===
    let file = planFilePath;  // Default: link to the plan itself
    let linkText = name;       // Default: use name as link text

    // Check explicit Link column first
    if (linkColIndex !== -1 && cols[linkColIndex]) {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(cols[linkColIndex]);
      if (linkMatch) {
        linkText = linkMatch[1];
        file = path.resolve(dir, linkMatch[2]);  // Resolve relative path
      }
    }

    // Also scan other columns for phase file links
    // This catches links embedded in other columns
    for (const col of cols) {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(col);
      // Only use if it looks like a phase file (contains "phase-")
      if (linkMatch && linkMatch[2].includes('phase-')) {
        linkText = linkMatch[1];
        file = path.resolve(dir, linkMatch[2]);
        break;  // Use first phase link found
      }
    }

    // === Build and store the phase object ===
    phases.push({
      phase: phaseNum,
      name: name.trim(),
      status: normalizeStatus(statusText),
      file,
      linkText: linkText.trim(),
    });
  }

  return { phases, nextScanLine: tableEndLine };
}

/**
 * Format 2: Link-first table
 *
 * This format puts the phase link in the first column:
 * | [Phase 1](./phase-01.md) | Description | Status |
 *
 * Common in plans that want clickable phase numbers as the primary navigation.
 *
 * @param content - Full markdown file content
 * @param dir - Directory containing plan.md (for resolving links)
 * @returns Array of parsed phases
 */
function parseLinkFirstTable(content: string, dir: string): PhaseData[] {
  const phases: PhaseData[] = [];

  // Regex breakdown:
  // \|         - Literal pipe character (start of cell)
  // \s*        - Optional whitespace
  // \[         - Opening bracket of markdown link
  // (?:Phase\s*)? - Optional "Phase " prefix (non-capturing)
  // (\d+)      - CAPTURE: Phase number (one or more digits)
  // \]         - Closing bracket of link text
  // \(([^)]+)\) - CAPTURE: Link path (everything between parentheses)
  // \s*        - Optional whitespace
  // \|         - Pipe separator
  // \s*        - Optional whitespace
  // ([^|]+)    - CAPTURE: Description (everything until next pipe)
  // \s*        - Optional whitespace
  // \|         - Pipe separator
  // \s*        - Optional whitespace
  // ([^|]+)    - CAPTURE: Status (everything until next pipe)
  const regex =
    /\|\s*\[(?:Phase\s*)?(\d+)\]\(([^)]+)\)\s*\|\s*([^|]+)\s*\|\s*([^|]+)/g;

  let match: RegExpExecArray | null;

  // Find all matches in the content
  while ((match = regex.exec(content)) !== null) {
    // Destructure the capture groups
    const [, phase, linkPath, name, status] = match;

    // Validate this is actually a phase row (not just any table row)
    if (!isValidStatus(status)) continue;

    phases.push({
      phase: parseInt(phase, 10),
      name: name.trim(),
      status: normalizeStatus(status),
      file: path.resolve(dir, linkPath),  // Resolve relative path to absolute
      linkText: `Phase ${phase}`,
    });
  }

  return phases;
}

/**
 * Format 3: Numbered list with inline status
 *
 * This format uses markdown numbered lists with bold names and status after a dash:
 * 1. **Database Schema** (12h) - ✅ COMPLETE - description
 * 2. **API Layer** - 🔄 IN PROGRESS
 *
 * Popular for simpler plans that don't need full table structure.
 *
 * @param content - Full markdown file content
 * @param planFilePath - Path to plan.md (used as phase file since no links)
 * @returns Array of parsed phases
 */
function parseNumberedListWithStatus(
  content: string,
  planFilePath: string
): PhaseData[] {
  const phases: PhaseData[] = [];

  // Complex regex explanation:
  // ^(\d+)\.   - Start of line, CAPTURE phase number, followed by period
  // \s*        - Optional whitespace
  // \*\*([^*]+)\*\* - CAPTURE: Bold text (the phase name)
  // [^-\n]*    - Any characters except dash or newline (e.g., "(12h)")
  // -          - Literal dash separator
  // \s*        - Optional whitespace
  // ((?:[\u{2705}...])?\s*(?:COMPLETE|...)[^\n-]*) - CAPTURE: Status with optional emoji
  //
  // The Unicode emoji block handles: ✅ ⏳ 🔄 ❌ ○ ⟳ ✓
  // The 'u' flag enables proper Unicode handling
  // The 'gim' flags: global, case-insensitive, multiline (^ matches line starts)
  const regex =
    /^(\d+)\.\s*\*\*([^*]+)\*\*[^-\n]*-\s*((?:[\u{2705}\u{23F3}\u{1F504}\u{274C}\u{25CB}\u{27F3}\u{2713}])?\s*(?:COMPLETE|COMPLETED|DONE|IN[- ]?PROGRESS|PENDING|WIP|TODO|CANCELLED|NOT[- ]?STARTED|PLANNED)[^\n-]*)/gimu;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const [, num, name, status] = match;

    phases.push({
      phase: parseInt(num, 10),
      name: name.trim(),
      status: normalizeStatus(status),
      file: planFilePath,      // No separate file - link to plan itself
      linkText: name.trim(),   // Use name as link text
    });
  }

  return phases;
}

/**
 * Format 4: Heading-based phases
 *
 * This format uses markdown headings for phase names with status on a separate line:
 * ### Phase 1: Database Setup
 * Some description text...
 * - Status: Completed
 *
 * Good for plans with longer descriptions per phase.
 *
 * @param content - Full markdown file content
 * @param planFilePath - Path to plan.md (used as phase file)
 * @returns Array of parsed phases
 */
function parseHeadingBased(
  content: string,
  planFilePath: string
): PhaseData[] {
  const phases: PhaseData[] = [];
  const lines = content.split('\n');

  // Track the currently-being-parsed phase
  // We build it up as we encounter heading + status lines
  let currentPhase: PhaseData | null = null;

  for (const line of lines) {
    // Check for phase heading: "### Phase X: Name"
    // Regex: ### Phase (number): (rest of line as name)
    const headingMatch = /###\s*Phase\s*(\d+)[:\s]+(.+)/i.exec(line);

    if (headingMatch) {
      // Found a new phase heading

      // First, save any previous phase we were building
      if (currentPhase) phases.push(currentPhase);

      // Start building the new phase
      const phaseNum = parseInt(headingMatch[1], 10);
      currentPhase = {
        phase: phaseNum,
        name: headingMatch[2].trim(),
        status: 'pending' as PhaseStatus,  // Default until we find status line
        file: planFilePath,
        linkText: `Phase ${phaseNum}`,
      };
    }

    // Check for status line (only if we're inside a phase)
    if (currentPhase) {
      // Look for "- Status: <value>" pattern
      const statusMatch = /-\s*Status:\s*(.+)/i.exec(line);
      if (statusMatch) {
        // Update the current phase's status
        currentPhase.status = normalizeStatus(statusMatch[1]);
      }
    }
  }

  // Don't forget the last phase (no heading after it to trigger save)
  if (currentPhase) phases.push(currentPhase);

  return phases;
}

/**
 * Format 5: Checkbox list with bold links (GitHub task list style)
 *
 * This format uses GitHub-style task lists:
 * - [x] **[Phase 1: Setup](./phase-01-setup.md)**
 * - [ ] **[Phase 2: Implementation](./phase-02-impl.md)**
 *
 * The checkbox state directly indicates completion:
 * - [x] = completed
 * - [ ] = pending
 *
 * @param content - Full markdown file content
 * @param dir - Directory containing plan.md (for resolving links)
 * @param planFilePath - Path to plan.md (unused but kept for consistency)
 * @returns Array of parsed phases
 */
function parseCheckboxList(
  content: string,
  dir: string,
  planFilePath: string
): PhaseData[] {
  const phases: PhaseData[] = [];

  // Regex breakdown:
  // ^-         - Start of line, dash (list item)
  // \s*        - Optional whitespace
  // \[(x| )\]  - CAPTURE: Checkbox state - "x" for checked, " " for unchecked
  // \s*        - Optional whitespace
  // \*\*       - Opening bold markers
  // \[         - Opening bracket of markdown link
  // (?:Phase\s*)? - Optional "Phase " prefix
  // (\d+)      - CAPTURE: Phase number
  // [:\s]*     - Optional colon and whitespace
  // ([^\]]*)\] - CAPTURE: Phase name (everything until closing bracket)
  // \(([^)]+)\) - CAPTURE: Link path
  // \*\*       - Closing bold markers
  //
  // Flags: g = global, i = case-insensitive, m = multiline (^ matches line starts)
  const regex =
    /^-\s*\[(x| )\]\s*\*\*\[(?:Phase\s*)?(\d+)[:\s]*([^\]]*)\]\(([^)]+)\)\*\*/gim;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const [, checked, phase, name, linkPath] = match;

    phases.push({
      phase: parseInt(phase, 10),
      name: name.trim() || `Phase ${phase}`,  // Fallback if name is empty
      // Checkbox state determines status: checked = completed, unchecked = pending
      status: checked.toLowerCase() === 'x' ? 'completed' : 'pending',
      file: path.resolve(dir, linkPath),
      linkText: name.trim() || `Phase ${phase}`,
    });
  }

  return phases;
}

/**
 * Parse multiple plan files and aggregate results.
 *
 * This is a convenience function for batch processing multiple plans.
 * Errors in individual files don't prevent processing of other files.
 *
 * @param planFiles - Array of absolute paths to plan.md files
 * @returns Map of file path → phases array
 *
 * @example
 * const files = ['/plans/plan-a/plan.md', '/plans/plan-b/plan.md'];
 * const results = parsePlans(files);
 * // Returns: Map { '/plans/plan-a/plan.md' => [...], '/plans/plan-b/plan.md' => [...] }
 */
export async function parsePlans(planFiles: string[]): Promise<Map<string, PhaseData[]>> {
  const results = new Map<string, PhaseData[]>();

  await Promise.all(
    planFiles.map(async (file) => {
      try {
        // Parse each file individually
        const phases = await parsePlanTable(file);
        results.set(file, phases);
      } catch (error) {
        // Log but don't throw - continue processing other files
        // A corrupted plan file shouldn't break the entire extension
        console.error(`Failed to parse ${file}:`, error);
        results.set(file, []); // Store empty array for failed parses
      }
    })
  );

  return results;
}

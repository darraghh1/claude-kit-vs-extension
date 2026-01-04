/**
 * Phase Metadata Extractor - extracts status from individual phase files
 *
 * This module reads phase-XX-*.md files and extracts their metadata,
 * particularly the "Implementation Status" which is the authoritative
 * status for that phase.
 *
 * Supported formats (in priority order):
 * 1. Overview table format (from /plan:hard):
 *    | Field | Value |
 *    | Implementation Status | ✅ Complete |
 *
 * 2. Inline metadata format (legacy):
 *    **Effort**: 2h | **Priority**: P1 | **Status**: Complete
 *
 * 3. YAML frontmatter:
 *    ---
 *    status: completed
 *    ---
 *
 * @module phaseMetadataExtractor
 */

import * as fs from 'fs';
import matter from 'gray-matter';
import { PhaseStatus } from '../types';
import { normalizeStatus } from './statusUtils';

/**
 * Metadata extracted from a phase file.
 * Contains status and optional additional fields.
 */
export interface PhaseFileMetadata {
  /** Implementation status from phase file */
  status: PhaseStatus;
  /** Review status (if present) */
  reviewStatus?: string;
  /** Effort estimate */
  effort?: string;
  /** Priority */
  priority?: string;
  /** Description */
  description?: string;
  /** Dependencies */
  dependsOn?: string;
  /** Date */
  date?: string;
}

/**
 * Extract metadata from a phase file.
 *
 * Tries multiple formats in priority order:
 * 1. Overview table (| Field | Value |)
 * 2. Inline metadata (**Status**: ...)
 * 3. YAML frontmatter
 *
 * @param filePath - Absolute path to phase file
 * @returns Extracted metadata, or null if file doesn't exist or can't be parsed
 *
 * @example
 * const meta = await extractPhaseMetadata('/path/to/phase-01-setup.md');
 * if (meta) {
 *   console.log(meta.status); // 'completed'
 * }
 */
export async function extractPhaseMetadata(
  filePath: string
): Promise<PhaseFileMetadata | null> {
  // Check if file exists
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    // File doesn't exist or isn't readable
    return null;
  }

  // Read file content
  const content = await fs.promises.readFile(filePath, 'utf8');

  // Try each format in priority order
  let metadata: PhaseFileMetadata | null;

  // Format 1: Overview table
  metadata = extractFromOverviewTable(content);
  if (metadata) return metadata;

  // Format 2: Inline metadata
  metadata = extractFromInlineMetadata(content);
  if (metadata) return metadata;

  // Format 3: YAML frontmatter
  metadata = extractFromFrontmatter(content);
  if (metadata) return metadata;

  // No metadata found
  return null;
}

/**
 * Extract metadata from Overview table format.
 *
 * This format comes from the /plan:hard command:
 * ```
 * ## Overview
 *
 * | Field | Value |
 * |-------|-------|
 * | Implementation Status | ✅ Complete |
 * | Review Status | Approved |
 * ```
 *
 * @param content - File content
 * @returns Extracted metadata, or null if no table found
 */
function extractFromOverviewTable(content: string): PhaseFileMetadata | null {
  // Look for a table with Field | Value structure
  // This regex finds table rows with two columns
  const tableRowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;

  const metadata: Partial<PhaseFileMetadata> = {};
  let foundStatus = false;
  let match: RegExpExecArray | null;

  // Find all table rows
  while ((match = tableRowRegex.exec(content)) !== null) {
    const field = match[1].trim().toLowerCase();
    const value = match[2].trim();

    // Skip header row (contains "field" and "value" or separator dashes)
    if (field === 'field' || field.includes('---')) continue;

    // Map known fields
    switch (field) {
      case 'implementation status':
      case 'status':
        metadata.status = normalizeStatus(value);
        foundStatus = true;
        break;
      case 'review status':
        metadata.reviewStatus = value;
        break;
      case 'effort':
        metadata.effort = value;
        break;
      case 'priority':
        metadata.priority = value;
        break;
      case 'description':
        metadata.description = value;
        break;
      case 'depends on':
      case 'dependencies':
        metadata.dependsOn = value;
        break;
      case 'date':
        metadata.date = value;
        break;
    }
  }

  // Only return if we found a status
  if (!foundStatus) return null;

  return {
    status: metadata.status || 'pending',
    reviewStatus: metadata.reviewStatus,
    effort: metadata.effort,
    priority: metadata.priority,
    description: metadata.description,
    dependsOn: metadata.dependsOn,
    date: metadata.date,
  };
}

/**
 * Extract metadata from inline format.
 *
 * This is the original/legacy format:
 * ```
 * **Effort**: 2h | **Priority**: P1 | **Status**: Complete
 * ```
 *
 * @param content - File content
 * @returns Extracted metadata, or null if no inline metadata found
 */
function extractFromInlineMetadata(content: string): PhaseFileMetadata | null {
  // Look in first 20 lines for inline metadata
  const headerSection = content.split('\n').slice(0, 20).join('\n');

  // Pattern: **Key**: Value
  const inlinePattern = /\*\*([^*]+)\*\*:?\s*([^|*\n]+)/g;

  const metadata: Partial<PhaseFileMetadata> = {};
  let foundStatus = false;
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(headerSection)) !== null) {
    const field = match[1].trim().toLowerCase();
    const value = match[2].trim();

    switch (field) {
      case 'status':
        metadata.status = normalizeStatus(value);
        foundStatus = true;
        break;
      case 'effort':
        metadata.effort = value;
        break;
      case 'priority':
        metadata.priority = value;
        break;
      case 'depends on':
        metadata.dependsOn = value;
        break;
    }
  }

  if (!foundStatus) return null;

  return {
    status: metadata.status || 'pending',
    effort: metadata.effort,
    priority: metadata.priority,
    dependsOn: metadata.dependsOn,
  };
}

/**
 * Extract metadata from YAML frontmatter.
 *
 * Fallback for phase files that use frontmatter:
 * ```
 * ---
 * status: completed
 * effort: 2h
 * ---
 * ```
 *
 * @param content - File content
 * @returns Extracted metadata, or null if no frontmatter
 */
function extractFromFrontmatter(content: string): PhaseFileMetadata | null {
  // Quick check: frontmatter must start at the beginning
  if (!content.trim().startsWith('---')) return null;

  try {
    const { data } = matter(content);

    if (!data || !data.status) return null;

    return {
      status: normalizeStatus(data.status),
      effort: data.effort,
      priority: data.priority,
      description: data.description,
      dependsOn: data.depends_on || data.dependsOn,
      date: data.date || data.created,
    };
  } catch {
    return null;
  }
}

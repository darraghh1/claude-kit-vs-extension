# Changelog

All notable changes to ClaudeKit Plans will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2026-01-02

### Changed

- **Async I/O Operations**
  - Refactored all file system operations to use `fs.promises` (non-blocking)
  - Plan files now parsed in parallel using `Promise.all` for better performance
  - Improves responsiveness with large numbers of plans

### Internal

- **Code Documentation**
  - Added comprehensive inline comments to all source files
  - Added ARCHITECTURE.md explaining codebase structure
  - Enhanced types with @example JSDoc annotations

## [0.1.5] - 2026-01-02

### Changed

- **Public Release Preparation**
  - Replaced large base64 embedded screenshot with placeholder (README size reduced 91%)
  - Added PNG extension icon for VS Code Marketplace display
  - Added `bugs` and `homepage` URLs to package.json
  - Added `.prettierrc` for consistent code formatting

### Fixed

- **Code Quality**
  - Added defensive null check in `openPhase` command handler

## [0.1.4] - 2026-01-02

### Fixed

- **Title Column Support**
  - Parser now recognizes `Title` as a valid name column header
  - Fixes plans using `| Phase | Title | Effort | Status |` format
  - Fixed duplicate TreeView ID error when parsing non-standard phase numbers

## [0.1.3] - 2026-01-02

### Changed

- **Repository Setup**
  - Updated repository URL for public GitHub distribution
  - Cleaned up build artifacts from version control
  - Improved icon design with progress indicators

## [0.1.2] - 2026-01-02

### Changed

- **Progress Display**: Changed from percentage (37%) to fraction (3/8) - more meaningful for binary phase completion

### Fixed

- **Parser Improvements**
  - Fixed dependency table being parsed instead of phase list (tables without Status column now skipped)
  - Fixed "Phase 1: None" issue when parsing tables with separate # and Phase columns
  - Fixed name extraction from links in Phase column (e.g., `[Database Setup](./path)`)
  - Added proper Unicode emoji support using `u` flag for surrogate pair handling
  - Added support for more status keywords: "Planned", "Not Started"

- **Numbered List Format**
  - Now correctly parses all phases with inline status (e.g., `1. **Name** - ✅ COMPLETE`)
  - Fixed Unicode emoji matching (🔄 and other multi-byte emojis now work)

## [0.1.1] - 2026-01-02

### Added

- **Smart Sorting**
  - Plans auto-sorted by: status → priority → progress → last modified
  - In-progress plans appear first, then by P1/P2/P3 priority

- **Filter Functionality**
  - Filter button in view header
  - Filter options: All, Active, In Progress, Pending, Completed
  - Filter indicator shows when filter is active
  - Filter preference persists across sessions

- **Commands**
  - `claudekit.filter` - Show filter QuickPick dialog

## [0.1.0] - 2026-01-02

### Added

- **TreeView Sidebar**
  - Hierarchical plan/phase display in Explorer
  - Status icons with semantic colors (green=completed, yellow=in-progress)
  - Priority badges on plan names
  - Progress fractions (3/8)
  - Click to open plan/phase files

- **Status Bar**
  - Quick progress view of current plan
  - Smart plan selection (in-progress > partial > recent)
  - Click to open current plan

- **Plan Parsing**
  - Support for 7 table formats (standard, link-first, number-link, simple, heading, checkbox, numbered list)
  - YAML frontmatter metadata extraction
  - Title, description, priority, effort, tags, branch, issue fields

- **File Watching**
  - Auto-refresh when plan.md or phase-*.md files change
  - 500ms debounce to prevent excessive refreshes
  - Multi-root workspace support

- **Commands**
  - `claudekit.refresh` - Force refresh plan data
  - `claudekit.diagnose` - Show diagnostic information
  - `claudekit.openPlan` - Open plan file
  - `claudekit.openPhase` - Open phase file
  - `claudekit.openCurrentPlan` - Open current active plan

- **Configuration**
  - `claudekit.plansPath` - Custom plans directory path
  - `claudekit.showStatusBar` - Toggle status bar visibility
  - `claudekit.autoRefresh` - Toggle file watching

- **Testing**
  - 69 unit tests covering all parsers and utilities
  - Test fixtures for all 7 table formats

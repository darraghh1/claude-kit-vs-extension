# Contributing to ClaudeKit Plans

Thanks for your interest in contributing! This document provides guidelines for contributing to the ClaudeKit Plans VS Code extension.

## Getting Started

### Prerequisites

- Node.js 18+
- VS Code 1.85+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/darraghh1/claude-kit-vs-extension.git
cd claude-kit-vs-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests
npm test
```

### Development Workflow

1. **Start watch mode**: `npm run watch`
2. **Launch debug**: Press `F5` in VS Code to open Extension Development Host
3. **Make changes**: Edit files in `src/`
4. **Test**: Run `npm test` to verify changes

## Project Structure

```
src/
├── extension.ts              # Extension entry point
├── types.ts                  # TypeScript type definitions
├── treeProvider.ts           # TreeDataProvider implementation
├── statusBar.ts              # Status bar management
├── planProject.ts            # Per-workspace state
└── parser/
    ├── planParser.ts         # Markdown table parsing
    ├── planScanner.ts        # Directory scanning
    ├── metadataExtractor.ts  # YAML frontmatter parsing
    └── statusUtils.ts        # Status normalization
```

## Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Use Prettier defaults
- **Naming**: camelCase for variables, PascalCase for types/classes
- **Comments**: Document complex logic, avoid obvious comments

## Testing

All changes should include tests:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- --grep "planParser"
```

Tests are in `src/**/*.test.ts` files alongside their implementation.

## Pull Request Process

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/my-feature`
3. **Make changes** with tests
4. **Run tests**: `npm test`
5. **Commit**: Use conventional commits (`feat:`, `fix:`, `docs:`)
6. **Push**: `git push origin feature/my-feature`
7. **Open PR**: Describe your changes clearly

### Commit Message Format

```
type(scope): description

feat(parser): add support for numbered list format
fix(treeview): handle empty phases gracefully
docs(readme): update installation instructions
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Adding New Table Formats

The parser supports multiple markdown table formats. To add a new format:

1. Add a new parse function in `src/parser/planParser.ts`
2. Call it from `parsePlanTable()` in order of specificity
3. Add test fixtures in `src/parser/planParser.test.ts`
4. Update README.md with the new format

## Reporting Issues

When reporting bugs, include:

- VS Code version
- Extension version
- Sample `plan.md` that reproduces the issue
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

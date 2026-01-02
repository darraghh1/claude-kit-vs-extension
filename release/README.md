# ClaudeKit VS Code Extension - Installation

Pre-built VSIX package for easy installation.

## Quick Install (Command Line)

```bash
code --install-extension claude-kit-vs-extension-0.1.6.vsix
```

Or for VS Code Insiders:

```bash
code-insiders --install-extension claude-kit-vs-extension-0.1.6.vsix
```

## GUI Install

1. Open VS Code
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
3. Type: `Extensions: Install from VSIX...`
4. Select the `.vsix` file from this folder

## Build From Source

If you prefer to verify the code and build yourself:

```bash
# Navigate to extension directory
cd apps/Claude-Kit-VS-Extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package the extension
npx @vscode/vsce package --out release/
```

### Prerequisites for Building

- Node.js 18+
- npm or pnpm

## Verify Package Contents

To inspect what's inside the VSIX (it's just a zip file):

```bash
# Rename to .zip
cp claude-kit-vs-extension-0.1.6.vsix claude-kit-vs-extension-0.1.6.zip

# Extract and inspect
unzip claude-kit-vs-extension-0.1.6.zip -d extracted/
```

## Uninstall

```bash
code --uninstall-extension digitalmastery.claude-kit-vs-extension
```

Or via VS Code: Extensions sidebar → Find ClaudeKit → Click Uninstall

## What's Included

| File | Purpose |
|------|---------|
| `dist/extension.js` | Compiled extension code |
| `package.json` | Extension manifest |
| `ARCHITECTURE.md` | Code architecture overview |
| `resources/` | Icons and assets |

---

**Version:** 0.1.6
**Publisher:** Digital Mastery Solutions

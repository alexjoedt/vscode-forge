# Forge VS Code Extension

Personal VS Code extension I created to manage versioning for my projects using my [Forge CLI](https://github.com/alexjoedt/forge).

## Features

- **Status Bar**: Shows current version with dirty state indicator
- **Tag Creation**: Quick commands (patch/minor/major) and guided wizard
- **Version History**: Tree view of all tags
- **Multi-App Support**: Monorepo with per-app versioning
- **Configuration**: Initialize and validate `forge.yaml`

## Requirements

- **Forge CLI** installed and in PATH
- **Git repository**

## Quick Start

1. Install [Forge CLI](https://github.com/alexjoedt/forge)
2. Run `Forge: Initialize Configuration` from Command Palette
3. Use `Forge: Create Tag (Wizard)` or quick commands

## Main Commands

- `Forge: Create Tag (Wizard)` - Guided tag creation
- `Forge: Create Patch/Minor/Major Tag` - Quick version bumps
- `Forge: Show Version Info` - Current version details
- `Forge: Select App` - Choose app in monorepo

## License

MIT



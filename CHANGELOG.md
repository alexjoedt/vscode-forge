# Change Log

All notable changes to the Forge VS Code extension will be documented in this file.

## [1.0.0] - 2025-11-02

### Added

#### Core Features
- **Status Bar Integration**: Displays current version with dirty state indicator
- **Version History View**: Tree view panel showing all project tags with details
- **Configuration Management**: Initialize and validate `forge.yaml` configuration files

#### Tag Creation
- **Tag Wizard**: Guided tag creation with step-by-step prompts
- **Quick Tag Commands**: Fast version bumps (patch/minor/major)
- **Create and Push**: Create tag and push to remote in one action

#### Multi-App Support
- **Monorepo Ready**: Support for multiple apps within a single repository
- **App Selector**: Easy switching between apps in monorepo projects
- **Per-App Versioning**: Individual version tracking for each app

#### Commands
- `Forge: Initialize Configuration` - Create initial forge.yaml file
- `Forge: Create Tag (Wizard)` - Guided tag creation process
- `Forge: Create Patch Tag` - Quick patch version bump
- `Forge: Create Minor Tag` - Quick minor version bump
- `Forge: Create Major Tag` - Quick major version bump
- `Forge: Create Tag and Push` - Create tag and push to remote
- `Forge: Show Version Info` - Display current version details
- `Forge: Show Tag Details` - View details for specific tags
- `Forge: Refresh` - Refresh version history view
- `Forge: Select App` - Choose app in monorepo
- `Forge: Show Output` - Open Forge output channel

#### Services & Architecture
- **Forge Service**: Integration with Forge CLI
- **Config Service**: Configuration parsing and validation
- **Git Service**: Git repository integration
- **Auto-activation**: Extension activates when `forge.yaml` is detected

#### UI Components
- **Status Bar Manager**: Real-time version display with dirty state
- **Version History Provider**: Tree data provider for tags
- **Tag Wizard UI**: Interactive multi-step tag creation

#### Watchers & Events
- **Config File Watcher**: Auto-refresh on forge.yaml changes
- **Git Tag Watcher**: Auto-update on tag changes
- **Dirty State Detection**: Real-time detection of uncommitted changes

### Requirements
- Forge CLI installed and available in PATH
- Git repository initialized

---

[1.0.0]: https://github.com/alexjoedt/vscode-forge/releases/tag/v1.0.0
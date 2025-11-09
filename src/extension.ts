/**
 * Forge VS Code Extension
 * 
 * Provides a convenient UI for managing versions, tags, builds, and Docker images
 * using the Forge CLI tool.
 */

import * as vscode from 'vscode';
import { ForgeService } from './services/forge.service';
import { ConfigService } from './services/config.service';
import { GitService } from './services/git.service';
import { StatusBarManager } from './ui/status-bar';
import { VersionHistoryProvider } from './providers/version-history.provider';
import { CommandRegistry } from './commands/registry';

// Services
let forgeService: ForgeService;
let configService: ConfigService;
let gitService: GitService;

// UI Components
let statusBar: StatusBarManager;
let versionHistoryProvider: VersionHistoryProvider;

// Commands
let commandRegistry: CommandRegistry;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
	console.log('Forge extension is now active');

	// Initialize services
	forgeService = new ForgeService();
	configService = new ConfigService();
	gitService = new GitService();

	// Initialize UI components
	statusBar = new StatusBarManager(forgeService, configService, gitService);
	versionHistoryProvider = new VersionHistoryProvider(forgeService, configService);

	// Register version history tree view
	const treeView = vscode.window.createTreeView('forgeVersionHistory', {
		treeDataProvider: versionHistoryProvider,
		showCollapseAll: false
	});
	context.subscriptions.push(treeView);

	// Register commands
	commandRegistry = new CommandRegistry(
		context,
		forgeService,
		configService,
		gitService,
		statusBar,
		versionHistoryProvider
	);
	commandRegistry.register();

	// Initialize status bar
	await statusBar.initialize();

	// Initialize version history
	versionHistoryProvider.refresh();

	// Add services to subscriptions for cleanup
	context.subscriptions.push(forgeService);
	context.subscriptions.push(configService);
	context.subscriptions.push(gitService);
	context.subscriptions.push(statusBar);

	// Watch for configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidSaveTextDocument(async (document) => {
			const fileName = document.fileName.toLowerCase();
			if (fileName.endsWith('forge.yaml') || fileName.endsWith('.forge.yaml')) {
				// Refresh everything when config changes
				configService.clearCache();
				await statusBar.initialize();
				versionHistoryProvider.refresh();
			}
		})
	);

	// Watch for git changes with debouncing to prevent excessive updates
	let gitUpdateTimeout: NodeJS.Timeout | undefined;
	const debouncedGitUpdate = () => {
		if (gitUpdateTimeout) {
			clearTimeout(gitUpdateTimeout);
		}
		gitUpdateTimeout = setTimeout(async () => {
			try {
				versionHistoryProvider.refresh();
				await statusBar.updateVersion();
			} catch (error) {
				// Silently fail - this is a background update
				console.error('Failed to update version info:', error);
			}
		}, 500); // Wait 500ms after last change
	};

	const gitWatcher = vscode.workspace.createFileSystemWatcher('**/.git/refs/tags/**');
	gitWatcher.onDidChange(debouncedGitUpdate);
	gitWatcher.onDidCreate(debouncedGitUpdate);
	gitWatcher.onDidDelete(debouncedGitUpdate);
	context.subscriptions.push(gitWatcher);

	// Clean up timeout on deactivation
	context.subscriptions.push({
		dispose: () => {
			if (gitUpdateTimeout) {
				clearTimeout(gitUpdateTimeout);
			}
		}
	});

	// Show welcome message for first-time users
	const hasShownWelcome = context.globalState.get('forge.hasShownWelcome', false);
	if (!hasShownWelcome) {
		const hasConfig = await configService.hasConfig();
		if (!hasConfig) {
			const action = await vscode.window.showInformationMessage(
				'Welcome to Forge! Would you like to initialize a forge.yaml configuration?',
				'Yes',
				'Not now'
			);

			if (action === 'Yes') {
				await vscode.commands.executeCommand('forge.init');
			}
		}
		await context.globalState.update('forge.hasShownWelcome', true);
	}

	console.log('Forge extension initialized successfully');
}

/**
 * Extension deactivation
 */
export function deactivate() {
	console.log('Forge extension is now deactivated');
}


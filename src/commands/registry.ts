/**
 * Command implementations for Forge extension
 */

import * as vscode from 'vscode';
import { ForgeService } from '../services/forge.service';
import { ConfigService } from '../services/config.service';
import { GitService } from '../services/git.service';
import { StatusBarManager } from '../ui/status-bar';
import { TagWizard } from '../ui/tag-wizard';
import { TagDetailsPanel } from '../ui/tag-details-panel';
import { VersionGraphPanel } from '../ui/version-graph-panel';
import { VersionHistoryProvider } from '../providers/version-history.provider';
import { BumpType, VersionHistoryEntry } from '../types/forge';

export class CommandRegistry {
	constructor(
		private context: vscode.ExtensionContext,
		private forgeService: ForgeService,
		private configService: ConfigService,
		private gitService: GitService,
		private statusBar: StatusBarManager,
		private versionHistoryProvider: VersionHistoryProvider
	) {}

	/**
	 * Register all commands
	 */
	register(): void {
		this.registerCommand('forge.init', () => this.initCommand());
		this.registerCommand('forge.createTag', () => this.createTagCommand());
		this.registerCommand('forge.createTagPatch', () => this.createQuickTagCommand('patch'));
		this.registerCommand('forge.createTagMinor', () => this.createQuickTagCommand('minor'));
		this.registerCommand('forge.createTagMajor', () => this.createQuickTagCommand('major'));
		this.registerCommand('forge.createTagAndPush', () => this.createTagAndPushCommand());
		this.registerCommand('forge.showVersionInfo', () => this.showVersionInfoCommand());
		this.registerCommand('forge.showTagDetails', (version: VersionHistoryEntry) => this.showTagDetailsCommand(version));
		this.registerCommand('forge.refreshVersionHistory', () => this.refreshVersionHistoryCommand());
		this.registerCommand('forge.selectApp', () => this.selectAppCommand());
		this.registerCommand('forge.showOutput', () => this.showOutputCommand());
		this.registerCommand('forge.install', () => this.installCommand());
		this.registerCommand('forge.build', () => this.buildCommand());
		this.registerCommand('forge.buildImage', () => this.buildImageCommand());
		this.registerCommand('forge.showGraphView', () => this.showGraphViewCommand());
	}

	/**
	 * Helper to register command
	 */
	private registerCommand(command: string, callback: (...args: any[]) => any): void {
		const disposable = vscode.commands.registerCommand(command, callback);
		this.context.subscriptions.push(disposable);
	}

	/**
	 * Command: Initialize forge.yaml
	 */
	private async initCommand(): Promise<void> {
		const hasConfig = await this.configService.hasConfig();
		
		if (hasConfig) {
			const overwrite = await vscode.window.showWarningMessage(
				'forge.yaml already exists. Overwrite?',
				'Yes',
				'No'
			);
			
			if (overwrite !== 'Yes') {
				return;
			}
		}

		// Ask for single or multi-app
		const type = await vscode.window.showQuickPick(
			[
				{ label: 'Single App', value: false },
				{ label: 'Multi App (Monorepo)', value: true }
			],
			{ placeHolder: 'Select configuration type' }
		);

		if (!type) {
			return;
		}

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Initializing forge.yaml...'
				},
				async () => {
					await this.forgeService.init({
						multi: type.value,
						dryRun: false
					});

					vscode.window.showInformationMessage('forge.yaml created successfully!');
					
					// Refresh status bar
					await this.statusBar.initialize();
					
					// Open the config file
					const configUri = await this.configService.getConfigUri();
					if (configUri) {
						await vscode.window.showTextDocument(configUri);
					}
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to initialize: ${error}`);
		}
	}

	/**
	 * Command: Create tag with wizard
	 */
	private async createTagCommand(): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const configType = await this.configService.getConfigType();
		let appName: string | undefined;

		if (configType?.isMultiApp) {
			appName = this.statusBar.getCurrentApp();
			
			if (!appName) {
				vscode.window.showWarningMessage('Please select an app first');
				await this.selectAppCommand();
				return;
			}
		}

		const wizard = new TagWizard(this.forgeService, this.configService, this.gitService);
		const result = await wizard.run(appName);

		if (result) {
			// Refresh status bar and history
			await this.statusBar.updateVersion(appName);
			this.versionHistoryProvider.refresh();
		}
	}

	/**
	 * Command: Quick create tag (patch/minor/major)
	 */
	private async createQuickTagCommand(bumpType: BumpType): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const configType = await this.configService.getConfigType();
		let appName: string | undefined;

		if (configType?.isMultiApp) {
			appName = this.statusBar.getCurrentApp();
			if (!appName) {
				vscode.window.showWarningMessage('Please select an app first');
				return;
			}
		}

		// Check if version tags exist
		try {
			const history = await this.forgeService.getVersionHistory({ app: appName, limit: 1 });
			if (!history.versions || history.versions.length === 0) {
				// No version tags exist - redirect to wizard for initial version
				vscode.window.showInformationMessage(
					'No version tags found. Please create an initial version first.',
					'Create Initial Version'
				).then(selection => {
					if (selection === 'Create Initial Version') {
						this.createTagCommand();
					}
				});
				return;
			}
		} catch (error) {
			// No version tags exist - redirect to wizard for initial version
			vscode.window.showInformationMessage(
				'No version tags found. Please create an initial version first.',
				'Create Initial Version'
			).then(selection => {
				if (selection === 'Create Initial Version') {
					this.createTagCommand();
				}
			});
			return;
		}

		// Check git status
		const isDirty = await this.gitService.isDirty();
		if (isDirty) {
			const proceed = await vscode.window.showWarningMessage(
				'Working directory has uncommitted changes. Continue?',
				'Yes',
				'No'
			);
			if (proceed !== 'Yes') {
				return;
			}
		}

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: `Creating ${bumpType} tag...`
				},
				async () => {
					const result = await this.forgeService.bump(bumpType, {
						app: appName,
						push: false
					});

					vscode.window.showInformationMessage(
						`Tag ${result.tag} created successfully!`
					);

					// Refresh
					await this.statusBar.updateVersion(appName);
					this.versionHistoryProvider.refresh();
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create tag: ${error}`);
		}
	}

	/**
	 * Command: Create tag and push
	 */
	private async createTagAndPushCommand(): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const configType = await this.configService.getConfigType();
		let appName: string | undefined;

		if (configType?.isMultiApp) {
			appName = this.statusBar.getCurrentApp();
			if (!appName) {
				vscode.window.showWarningMessage('Please select an app first');
				return;
			}
		}

		// Check if version tags exist
		try {
			const history = await this.forgeService.getVersionHistory({ app: appName, limit: 1 });
			if (!history.versions || history.versions.length === 0) {
				// No version tags exist - redirect to wizard for initial version
				vscode.window.showInformationMessage(
					'No version tags found. Please create an initial version first.',
					'Create Initial Version'
				).then(selection => {
					if (selection === 'Create Initial Version') {
						this.createTagCommand();
					}
				});
				return;
			}
		} catch (error) {
			// No version tags exist - redirect to wizard for initial version
			vscode.window.showInformationMessage(
				'No version tags found. Please create an initial version first.',
				'Create Initial Version'
			).then(selection => {
				if (selection === 'Create Initial Version') {
					this.createTagCommand();
				}
			});
			return;
		}

		// Get bump type
		const bumpType = await vscode.window.showQuickPick(
			[
				{ label: 'Patch', value: 'patch' as BumpType },
				{ label: 'Minor', value: 'minor' as BumpType },
				{ label: 'Major', value: 'major' as BumpType }
			],
			{ placeHolder: 'Select version bump type' }
		);

		if (!bumpType) {
			return;
		}

		try {
			const result = await this.forgeService.bump(bumpType.value, {
				app: appName,
				push: true
			});

			vscode.window.showInformationMessage(
				`Tag ${result.tag} created and pushed successfully!`
			);

			await this.statusBar.updateVersion(appName);
			this.versionHistoryProvider.refresh();
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create and push tag: ${error}`);
		}
	}

	/**
	 * Command: Show version info
	 */
	private async showVersionInfoCommand(): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const appName = this.statusBar.getCurrentApp();

		try {
			const version = await this.forgeService.getVersion({ app: appName });
			const isDirty = await this.gitService.isDirty();
			
			const lines: string[] = [];
			if (appName) {
				lines.push(`App: ${appName}`);
			}
			lines.push(`Version: ${version.version}`);
			lines.push(`Scheme: ${version.scheme}`);
			if (version.commit) {
				lines.push(`Commit: ${version.commit}`);
			}
			if (isDirty) {
				lines.push('⚠️ Working directory has uncommitted changes');
			}

			vscode.window.showInformationMessage(lines.join('\n'));
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to get version: ${error}`);
		}
	}

	/**
	 * Command: Show tag details
	 */
	private async showTagDetailsCommand(versionOrTreeItem: VersionHistoryEntry | any): Promise<void> {
		// Handle both VersionHistoryEntry (from tree item click) and VersionTreeItem (from context menu)
		const version: VersionHistoryEntry = 
			versionOrTreeItem?.versionEntry ?? versionOrTreeItem;
		
		if (!version || !version.version) {
			vscode.window.showErrorMessage('Invalid version data');
			return;
		}

		// Show detailed tag information in a webview panel
		await TagDetailsPanel.show(
			this.context.extensionUri,
			this.gitService,
			version
		);
	}

	/**
	 * Command: Refresh version history
	 */
	private refreshVersionHistoryCommand(): void {
		this.versionHistoryProvider.refresh();
	}

	/**
	 * Command: Select app (multi-app)
	 */
	private async selectAppCommand(): Promise<void> {
		const apps = await this.configService.getApps();
		
		if (apps.length === 0) {
			vscode.window.showInformationMessage('No apps found in configuration');
			return;
		}

		const selected = await vscode.window.showQuickPick(apps, {
			placeHolder: 'Select app'
		});

		if (selected) {
			this.statusBar.setCurrentApp(selected);
			this.versionHistoryProvider.setCurrentApp(selected);
			vscode.window.showInformationMessage(`Selected app: ${selected}`);
		}
	}

	/**
	 * Command: Show output channel
	 */
	private showOutputCommand(): void {
		this.forgeService.showOutput();
	}

	/**
	 * Command: Install forge
	 */
	private async installCommand(): Promise<void> {
		const action = await vscode.window.showInformationMessage(
			'Install Forge CLI',
			'Install with Go',
			'Open GitHub',
			'Open Documentation'
		);

		if (action === 'Install with Go') {
			const success = await this.forgeService.installForge();
			if (success) {
				// Refresh UI after successful installation
				await this.statusBar.initialize();
				this.versionHistoryProvider.refresh();
			}
		} else if (action === 'Open GitHub') {
			vscode.env.openExternal(vscode.Uri.parse('https://github.com/alexjoedt/forge'));
		} else if (action === 'Open Documentation') {
			vscode.env.openExternal(vscode.Uri.parse('https://github.com/alexjoedt/forge#installation'));
		}
	}

	/**
	 * Command: Build binaries
	 */
	private async buildCommand(): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const appName = this.statusBar.getCurrentApp();

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Building binaries...',
					cancellable: false
				},
				async () => {
					const result = await this.forgeService.build({ app: appName });
					
					vscode.window.showInformationMessage(
						`Build completed! Output: ${result.output_dir}`
					);
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Build failed: ${error}`);
		}
	}

	/**
	 * Command: Build Docker image
	 */
	private async buildImageCommand(): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const appName = this.statusBar.getCurrentApp();

		const push = await vscode.window.showQuickPick(
			[
				{ label: 'Build Only', value: false },
				{ label: 'Build and Push', value: true }
			],
			{ placeHolder: 'Select action' }
		);

		if (push === undefined) {
			return;
		}

		try {
			await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: push.value ? 'Building and pushing image...' : 'Building image...',
					cancellable: false
				},
				async () => {
					const result = await this.forgeService.buildImage({
						app: appName,
						push: push.value
					});

					const pushText = push.value ? ' and pushed' : '';
					vscode.window.showInformationMessage(
						`Image built${pushText}! Tags: ${result.tags.join(', ')}`
					);
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Image build failed: ${error}`);
		}
	}

	/**
	 * Command: Show graph view
	 */
	private async showGraphViewCommand(): Promise<void> {
		if (!await this.forgeService.ensureInstalled()) {
			return;
		}

		const appName = this.statusBar.getCurrentApp();

		try {
			// Get version history with higher limit for graph visualization
			const limit = vscode.workspace.getConfiguration('forge')
				.get<number>('graphHistoryLimit', 50);

			const history = await this.forgeService.getVersionHistory({
				app: appName,
				limit: limit
			});

			if (history.versions.length === 0) {
				vscode.window.showInformationMessage('No version tags found');
				return;
			}

			// Get hotfix suffixes from configuration
			const hotfixSuffixes = vscode.workspace.getConfiguration('forge')
				.get<string[]>('hotfixSuffixes', ['hotfix', 'patch', 'fix']);

			// Show graph panel
			await VersionGraphPanel.show(
				this.context.extensionUri,
				history.versions,
				{ hotfixSuffixes }
			);

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to load graph: ${error}`);
		}
	}
}

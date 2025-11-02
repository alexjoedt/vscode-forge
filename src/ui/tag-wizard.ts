/**
 * Multi-step wizard for creating tags
 */

import * as vscode from 'vscode';
import { ForgeService } from '../services/forge.service';
import { ConfigService } from '../services/config.service';
import { GitService } from '../services/git.service';
import { BumpType, VersionInfo, BumpResult, VersionScheme } from '../types/forge';

export class TagWizard {
	constructor(
		private forgeService: ForgeService,
		private configService: ConfigService,
		private gitService: GitService
	) {}

	/**
	 * Run the tag creation wizard
	 */
	async run(appName?: string): Promise<BumpResult | undefined> {
		try {
			// Step 1: Validate configuration
			const validationErrors = await this.configService.validateConfig();
			if (validationErrors.length > 0) {
				vscode.window.showErrorMessage(
					`Configuration validation failed: ${validationErrors.join(', ')}`
				);
				return undefined;
			}

			// Step 2: Check git repository status
			const isDirty = await this.gitService.isDirty();
			if (isDirty) {
				const proceed = await vscode.window.showWarningMessage(
					'Working directory has uncommitted changes. Continue?',
					'Yes',
					'No'
				);
				if (proceed !== 'Yes') {
					return undefined;
				}
			}

			// Step 3: Get current version
			const currentVersion = await this.getCurrentVersion(appName);
			
			// Check if this is the first version
			if (!currentVersion) {
				// No version tags found - create initial version
				return await this.createInitialVersion(appName);
			}

			// Step 4: Select bump type or CalVer auto
			const versionConfig = await this.configService.getVersionConfig(appName);
			const bumpType = await this.selectBumpType(currentVersion, versionConfig?.scheme);
			if (!bumpType) {
				return undefined; // User cancelled
			}

			// Step 5: Optional prerelease identifier
			const pre = await this.getPrerelease();

			// Step 6: Optional metadata
			const meta = await this.getMetadata();

			// Step 7: Preview (dry-run)
			const preview = await this.previewTag(bumpType, appName, pre, meta);
			if (!preview) {
				return undefined;
			}

			// Confirm creation
			const confirmText = `Create tag ${preview.tag}?`;
			const confirm = await vscode.window.showInformationMessage(
				confirmText,
				{ modal: true },
				'Create',
				'Create & Push'
			);

			if (!confirm) {
				return undefined; // User cancelled
			}

			// Step 8: Create tag
			const push = confirm === 'Create & Push';
			return await this.createTag(bumpType, appName, push, pre, meta);

		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create tag: ${error}`);
			return undefined;
		}
	}

	/**
	 * Get current version
	 */
	private async getCurrentVersion(appName?: string): Promise<VersionInfo | undefined> {
		try {
			// Check if any version tags exist using version list
			const history = await this.forgeService.getVersionHistory({ app: appName, limit: 1 });
			
			if (!history.versions || history.versions.length === 0) {
				// No version tags found
				return undefined;
			}

			// Get the current version info
			const version = await this.forgeService.getVersion({ app: appName });
			
			const appPrefix = appName ? `${appName}: ` : '';
			vscode.window.showInformationMessage(
				`${appPrefix}Current version: ${version.version}`
			);
			
			return version;
		} catch (error) {
			// Error getting version history or current version - treat as no tags
			return undefined;
		}
	}

	/**
	 * Create initial version when no tags exist
	 */
	private async createInitialVersion(appName?: string): Promise<BumpResult | undefined> {
		// Get version configuration to determine the scheme
		const versionConfig = await this.configService.getVersionConfig(appName);
		const scheme = versionConfig?.scheme || 'semver';

		// Inform user about initial version creation
		const appPrefix = appName ? ` for ${appName}` : '';
		const proceed = await vscode.window.showInformationMessage(
			`No version tags found${appPrefix}. Create initial version?`,
			{ modal: true },
			'Yes',
			'No'
		);

		if (proceed !== 'Yes') {
			return undefined;
		}

		// Get initial version from user based on scheme
		let initialVersion: string | undefined;
		let defaultValue: string;
		let prompt: string;

		if (scheme === 'calver') {
			const calverFormat = versionConfig?.calver_format || 'YYYY.MM.DD';
			defaultValue = this.generateCalverDefault(calverFormat);
			prompt = `Enter initial CalVer version (format: ${calverFormat})`;
		} else {
			defaultValue = '1.0.0';
			prompt = 'Enter initial SemVer version (e.g., 1.0.0, 0.1.0)';
		}

		initialVersion = await vscode.window.showInputBox({
			title: 'Initial Version',
			value: defaultValue,
			prompt: prompt,
			validateInput: (value) => {
				if (!value) {
					return 'Version is required';
				}
				// Basic validation based on scheme
				if (scheme === 'semver') {
					if (!/^\d+\.\d+\.\d+$/.test(value)) {
						return 'Invalid SemVer format. Use format: X.Y.Z (e.g., 1.0.0)';
					}
				} else {
					// CalVer validation is more lenient
					if (!/^[\d.]+$/.test(value)) {
						return 'Invalid CalVer format. Use digits and dots only.';
					}
				}
				return undefined;
			}
		});

		if (!initialVersion) {
			return undefined; // User cancelled
		}

		// Optional prerelease identifier
		const pre = await this.getPrerelease();

		// Optional metadata
		const meta = await this.getMetadata();

		// Add prefix if configured
		const prefix = versionConfig?.prefix || '';
		const fullVersion = `${prefix}${initialVersion}${pre ? '-' + pre : ''}${meta ? '+' + meta : ''}`;

		// Confirm creation
		const confirm = await vscode.window.showInformationMessage(
			`Create initial tag ${fullVersion}?`,
			{ modal: true },
			'Create',
			'Create & Push'
		);

		if (!confirm) {
			return undefined;
		}

		// Create the initial tag
		const push = confirm === 'Create & Push';
		
		try {
			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: push ? 'Creating and pushing initial tag...' : 'Creating initial tag...',
					cancellable: false
				},
				async () => {
					// Call forge bump with initial flag - don't pass dry-run
					const result = await this.forgeService.bump(undefined, {
						app: appName,
						initial: initialVersion,
						push,
						pre,
						meta,
						dryRun: false // Explicitly set to false to avoid issues
					});

					const pushText = push ? ' and pushed' : '';
					vscode.window.showInformationMessage(
						`Initial tag ${result.tag} created${pushText} successfully!`
					);

					return result;
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create initial tag: ${error}`);
			return undefined;
		}
	}

	/**
	 * Generate a default CalVer version based on format
	 */
	private generateCalverDefault(format: string): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');

		let result = format
			.replace('YYYY', String(year))
			.replace('YY', String(year).slice(-2))
			.replace('MM', month)
			.replace('DD', day);

		// Add minor version if format doesn't have enough components
		if (!result.includes('.')) {
			result += '.0';
		}

		return result;
	}

	/**
	 * Select bump type
	 */
	private async selectBumpType(
		currentVersion: VersionInfo,
		scheme?: VersionScheme
	): Promise<BumpType | 'auto' | undefined> {
		if (scheme === 'calver') {
			// CalVer uses auto-increment
			const items: vscode.QuickPickItem[] = [
				{
					label: '$(calendar) Auto',
					description: 'Automatically increment based on date',
					detail: `Current: ${currentVersion.version}`
				}
			];

			const selected = await vscode.window.showQuickPick(items, {
				title: 'CalVer Tag Creation',
				placeHolder: 'Select versioning method'
			});

			return selected ? 'auto' : undefined;
		}

		// SemVer bump types
		const items: vscode.QuickPickItem[] = [
			{
				label: '$(rocket) Major',
				description: 'Breaking changes',
				detail: 'Increments major version (X.0.0)'
			},
			{
				label: '$(package) Minor',
				description: 'New features',
				detail: 'Increments minor version (x.X.0)'
			},
			{
				label: '$(bug) Patch',
				description: 'Bug fixes',
				detail: 'Increments patch version (x.x.X)'
			}
		];

		const selected = await vscode.window.showQuickPick(items, {
			title: 'SemVer Tag Creation',
			placeHolder: `Select bump type (Current: ${currentVersion.version})`
		});

		if (!selected) {
			return undefined;
		}

		// Extract bump type from label
		const label = selected.label.toLowerCase();
		if (label.includes('major')) { return 'major'; }
		if (label.includes('minor')) { return 'minor'; }
		if (label.includes('patch')) { return 'patch'; }

		return undefined;
	}

	/**
	 * Get prerelease identifier (optional)
	 */
	private async getPrerelease(): Promise<string | undefined> {
		const result = await vscode.window.showInputBox({
			title: 'Prerelease Identifier (Optional)',
			placeHolder: 'e.g., rc.1, alpha.1, beta.2',
			prompt: 'Leave empty for stable release',
			validateInput: (value) => {
				if (!value) {
					return undefined; // Empty is valid
				}
				// Basic validation for prerelease format
				if (!/^[a-zA-Z0-9.-]+$/.test(value)) {
					return 'Invalid prerelease format. Use alphanumeric characters, dots, and hyphens.';
				}
				return undefined;
			}
		});

		return result || undefined;
	}

	/**
	 * Get build metadata (optional)
	 */
	private async getMetadata(): Promise<string | undefined> {
		const result = await vscode.window.showInputBox({
			title: 'Build Metadata (Optional)',
			placeHolder: 'e.g., build.123, commit.abc123',
			prompt: 'Leave empty to skip',
			validateInput: (value) => {
				if (!value) {
					return undefined; // Empty is valid
				}
				// Basic validation for metadata format
				if (!/^[a-zA-Z0-9.-]+$/.test(value)) {
					return 'Invalid metadata format. Use alphanumeric characters, dots, and hyphens.';
				}
				return undefined;
			}
		});

		return result || undefined;
	}

	/**
	 * Preview tag creation (dry-run)
	 */
	private async previewTag(
		bumpType: BumpType | 'auto',
		appName?: string,
		pre?: string,
		meta?: string
	): Promise<BumpResult | undefined> {
		try {
			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'Previewing tag...',
					cancellable: false
				},
				async () => {
					const bump = bumpType === 'auto' ? undefined : bumpType;
					return await this.forgeService.bump(bump, {
						app: appName,
						dryRun: true,
						pre,
						meta
					});
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Preview failed: ${error}`);
			return undefined;
		}
	}

	/**
	 * Create tag
	 */
	private async createTag(
		bumpType: BumpType | 'auto',
		appName?: string,
		push: boolean = false,
		pre?: string,
		meta?: string
	): Promise<BumpResult | undefined> {
		try {
			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: push ? 'Creating and pushing tag...' : 'Creating tag...',
					cancellable: false
				},
				async () => {
					const bump = bumpType === 'auto' ? undefined : bumpType;
					const result = await this.forgeService.bump(bump, {
						app: appName,
						push,
						pre,
						meta
					});

					const pushText = push ? ' and pushed' : '';
					vscode.window.showInformationMessage(
						`Tag ${result.tag} created${pushText} successfully!`
					);

					return result;
				}
			);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create tag: ${error}`);
			return undefined;
		}
	}
}

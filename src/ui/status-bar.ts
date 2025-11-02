/**
 * Status bar manager for showing version information
 */

import * as vscode from 'vscode';
import { ForgeService } from '../services/forge.service';
import { ConfigService } from '../services/config.service';
import { GitService } from '../services/git.service';
import { VersionInfo } from '../types/forge';

export class StatusBarManager {
	private statusBarItem: vscode.StatusBarItem;
	private currentApp: string | undefined;

	constructor(
		private forgeService: ForgeService,
		private configService: ConfigService,
		private gitService: GitService
	) {
		this.statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		this.statusBarItem.command = 'forge.showVersionInfo';
	}

	/**
	 * Initialize and show status bar
	 */
	async initialize(): Promise<void> {
		const installation = await this.forgeService.checkInstallation();
		
		if (!installation.installed) {
			this.showNotInstalled();
			return;
		}

		const hasConfig = await this.configService.hasConfig();
		if (!hasConfig) {
			this.showNoConfig();
			return;
		}

		const isGitRepo = await this.gitService.isGitRepository();
		if (!isGitRepo) {
			this.showNoGitRepo();
			return;
		}

		await this.updateVersion();
		this.statusBarItem.show();
	}

	/**
	 * Update version display
	 */
	async updateVersion(appName?: string): Promise<void> {
		try {
			// Use provided app name or current app
			const app = appName || this.currentApp;
			
			// Get version info
			const versionInfo = await this.forgeService.getVersion({ app });
			
			// Update display
			this.showVersion(versionInfo, app);
		} catch (error) {
			this.showError();
		}
	}

	/**
	 * Set current app (for multi-app configs)
	 */
	setCurrentApp(appName: string | undefined): void {
		this.currentApp = appName;
		this.updateVersion();
	}

	/**
	 * Get current app
	 */
	getCurrentApp(): string | undefined {
		return this.currentApp;
	}

	/**
	 * Show version in status bar
	 */
	private showVersion(versionInfo: VersionInfo, appName?: string): void {
		const icon = versionInfo.dirty ? '$(warning)' : '$(tag)';
		const appPrefix = appName ? `${appName}: ` : '';
		const dirtySuffix = versionInfo.dirty ? ' (dirty)' : '';
		
		this.statusBarItem.text = `${icon} ${appPrefix}${versionInfo.version}${dirtySuffix}`;
		this.statusBarItem.tooltip = this.buildTooltip(versionInfo, appName);
		this.statusBarItem.backgroundColor = versionInfo.dirty 
			? new vscode.ThemeColor('statusBarItem.warningBackground')
			: undefined;
		this.statusBarItem.show();
	}

	/**
	 * Show not installed message
	 */
	private showNotInstalled(): void {
		this.statusBarItem.text = '$(alert) Forge: Not Installed';
		this.statusBarItem.tooltip = 'Click to install Forge CLI';
		this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.statusBarItem.command = 'forge.install';
		this.statusBarItem.show();
	}

	/**
	 * Show no config message
	 */
	private showNoConfig(): void {
		this.statusBarItem.text = '$(file-add) Forge: No Config';
		this.statusBarItem.tooltip = 'Click to initialize forge.yaml';
		this.statusBarItem.command = 'forge.init';
		this.statusBarItem.show();
	}

	/**
	 * Show no git repo message
	 */
	private showNoGitRepo(): void {
		this.statusBarItem.text = '$(alert) Forge: No Git Repository';
		this.statusBarItem.tooltip = 'Forge requires a git repository';
		this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		this.statusBarItem.show();
	}

	/**
	 * Show error state
	 */
	private showError(): void {
		this.statusBarItem.text = '$(alert) Forge: Error';
		this.statusBarItem.tooltip = 'Click to view logs';
		this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
		this.statusBarItem.command = 'forge.showOutput';
		this.statusBarItem.show();
	}

	/**
	 * Build tooltip text
	 */
	private buildTooltip(versionInfo: VersionInfo, appName?: string): string {
		const lines: string[] = [];
		
		if (appName) {
			lines.push(`App: ${appName}`);
		}
		
		lines.push(`Version: ${versionInfo.version}`);
		lines.push(`Scheme: ${versionInfo.scheme}`);
		
		if (versionInfo.commit) {
			lines.push(`Commit: ${versionInfo.commit.substring(0, 7)}`);
		}
		
		if (versionInfo.dirty) {
			lines.push('⚠️ Working directory has uncommitted changes');
		}
		
		lines.push('');
		lines.push('Click for more details');
		
		return lines.join('\n');
	}

	/**
	 * Hide status bar
	 */
	hide(): void {
		this.statusBarItem.hide();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.statusBarItem.dispose();
	}
}

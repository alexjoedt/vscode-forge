/**
 * Tree view provider for showing version/tag history
 */

import * as vscode from 'vscode';
import { ForgeService } from '../services/forge.service';
import { ConfigService } from '../services/config.service';
import { VersionHistoryEntry } from '../types/forge';

export class VersionHistoryProvider implements vscode.TreeDataProvider<VersionTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<VersionTreeItem | undefined | null | void> = 
		new vscode.EventEmitter<VersionTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<VersionTreeItem | undefined | null | void> = 
		this._onDidChangeTreeData.event;

	private currentApp: string | undefined;

	constructor(
		private forgeService: ForgeService,
		private configService: ConfigService
	) {}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	/**
	 * Set current app for filtering tags
	 */
	setCurrentApp(appName: string | undefined): void {
		this.currentApp = appName;
		this.refresh();
	}

	/**
	 * Get tree item
	 */
	getTreeItem(element: VersionTreeItem): vscode.TreeItem {
		return element;
	}

	/**
	 * Get children for tree view
	 */
	async getChildren(element?: VersionTreeItem): Promise<VersionTreeItem[]> {
		if (!element) {
			// Root level - show tags
			return await this.getRootItems();
		}

		// No nested items for now
		return [];
	}

	/**
	 * Get root level items (tags)
	 */
	private async getRootItems(): Promise<VersionTreeItem[]> {
		try {
			// Check if config exists first
			const hasConfig = await this.configService.hasConfig();
			if (!hasConfig) {
				return [this.createNoConfigItem()];
			}

			// Get version history from forge
			const history = await this.forgeService.getVersionHistory({ app: this.currentApp });

			if (history.versions.length === 0) {
				return [this.createNoTagsItem()];
			}

			// Convert to tree items
			return history.versions.map(version => this.createVersionItem(version));

		} catch (error) {
			console.error('Error loading version history:', error);
			return [this.createErrorItem(`${error}`)];
		}
	}

	/**
	 * Create tree item for a version
	 */
	private createVersionItem(version: VersionHistoryEntry): VersionTreeItem {
		const item = new VersionTreeItem(
			version.version,
			vscode.TreeItemCollapsibleState.None,
			'tag'
		);

		item.description = version.commit ? version.commit.substring(0, 7) : 'unknown';
		item.tooltip = this.buildVersionTooltip(version);
		item.iconPath = new vscode.ThemeIcon('tag');
		item.contextValue = 'forgeTag';

		// Store version data for context menu commands
		item.versionEntry = version;

		// Command to show tag details
		item.command = {
			command: 'forge.showTagDetails',
			title: 'Show Tag Details',
			arguments: [version]
		};

		return item;
	}

	/**
	 * Create "no tags" placeholder item
	 */
	private createNoTagsItem(): VersionTreeItem {
		const item = new VersionTreeItem(
			'No tags found',
			vscode.TreeItemCollapsibleState.None,
			'placeholder'
		);

		item.iconPath = new vscode.ThemeIcon('info');
		item.contextValue = 'forgeNoTags';
		item.command = {
			command: 'forge.createTag',
			title: 'Create First Tag'
		};

		return item;
	}

	/**
	 * Create "no config" placeholder item
	 */
	private createNoConfigItem(): VersionTreeItem {
		const item = new VersionTreeItem(
			'No forge.yaml found',
			vscode.TreeItemCollapsibleState.None,
			'placeholder'
		);

		item.description = 'Click to initialize';
		item.iconPath = new vscode.ThemeIcon('warning');
		item.contextValue = 'forgeNoConfig';
		item.tooltip = 'No forge.yaml configuration file found in the workspace. Click to create one.';
		item.command = {
			command: 'forge.init',
			title: 'Initialize Forge Config'
		};

		return item;
	}

	/**
	 * Create error item
	 */
	private createErrorItem(message: string): VersionTreeItem {
		const item = new VersionTreeItem(
			`Error: ${message}`,
			vscode.TreeItemCollapsibleState.None,
			'error'
		);

		item.iconPath = new vscode.ThemeIcon('error');
		item.contextValue = 'forgeError';

		return item;
	}

	/**
	 * Build tooltip for version
	 */
	private buildVersionTooltip(version: VersionHistoryEntry): string {
		const lines: string[] = [];
		lines.push(`Tag: ${version.tag}`);
		lines.push(`Version: ${version.version}`);
		
		if (version.commit) {
			lines.push(`Commit: ${version.commit.substring(0, 7)}`);
		}
		
		lines.push(`Date: ${version.date}`);
		
		if (version.message) {
			lines.push(`Message: ${version.message}`);
		}

		return lines.join('\n');
	}
}

/**
 * Tree item for version history
 */
export class VersionTreeItem extends vscode.TreeItem {
	versionEntry?: VersionHistoryEntry;

	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly itemType: 'tag' | 'placeholder' | 'error'
	) {
		super(label, collapsibleState);
	}
}

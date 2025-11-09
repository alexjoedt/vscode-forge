/**
 * Webview panel for displaying detailed tag information
 */

import * as vscode from 'vscode';
import { VersionHistoryEntry } from '../types/forge';
import { GitService } from '../services/git.service';

export class TagDetailsPanel {
	private static currentPanel: TagDetailsPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private disposables: vscode.Disposable[] = [];

	private constructor(
		panel: vscode.WebviewPanel,
		private gitService: GitService,
		private version: VersionHistoryEntry
	) {
		this.panel = panel;
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.update();
	}

	/**
	 * Create or show the panel
	 */
	public static async show(
		extensionUri: vscode.Uri,
		gitService: GitService,
		version: VersionHistoryEntry
	): Promise<void> {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it
		if (TagDetailsPanel.currentPanel) {
			TagDetailsPanel.currentPanel.version = version;
			TagDetailsPanel.currentPanel.panel.reveal(column);
			await TagDetailsPanel.currentPanel.update();
			return;
		}

		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			'forgeTagDetails',
			`Tag: ${version.tag}`,
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [extensionUri],
				retainContextWhenHidden: true
			}
		);

		TagDetailsPanel.currentPanel = new TagDetailsPanel(panel, gitService, version);
	}

	/**
	 * Update the webview content
	 */
	private async update(): Promise<void> {
		const webview = this.panel.webview;
		this.panel.title = `Tag: ${this.version.tag}`;
		this.panel.webview.html = await this.getHtmlContent(webview);
	}

	/**
	 * Get commit details from git
	 */
	private async getCommitDetails(): Promise<{
		fullMessage: string;
		author: string;
		authorEmail: string;
		authorDate: string;
		filesChanged: number;
		insertions: number;
		deletions: number;
		diffStat: string;
		fileDiffs: Array<{name: string, changes: string}>;
	}> {
		try {
			const fullMessage = await this.gitService.getCommitMessage(this.version.commit);
			const author = await this.gitService.getCommitAuthor(this.version.commit);
			const authorEmail = await this.gitService.getCommitAuthorEmail(this.version.commit);
			const authorDate = await this.gitService.getCommitDate(this.version.commit);
			const stats = await this.gitService.getCommitStats(this.version.commit);
			const diffStat = await this.gitService.getCommitDiffStat(this.version.commit);
			const fileDiffs = await this.gitService.getCommitFileDiffs(this.version.commit);

			return {
				fullMessage,
				author,
				authorEmail,
				authorDate,
				...stats,
				diffStat,
				fileDiffs
			};
		} catch (error) {
			console.error('Error fetching commit details:', error);
			return {
				fullMessage: this.version.message || 'N/A',
				author: 'Unknown',
				authorEmail: '',
				authorDate: this.version.date,
				filesChanged: 0,
				insertions: 0,
				deletions: 0,
				diffStat: '',
				fileDiffs: []
			};
		}
	}

	/**
	 * Generate HTML content
	 */
	private async getHtmlContent(webview: vscode.Webview): Promise<string> {
		const details = await this.getCommitDetails();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Tag Details</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
			line-height: 1.6;
		}

		.container {
			max-width: 1200px;
			margin: 0 auto;
		}

		.header {
			border-bottom: 1px solid var(--vscode-panel-border);
			padding-bottom: 20px;
			margin-bottom: 20px;
		}

		.header h1 {
			font-size: 24px;
			font-weight: 600;
			margin-bottom: 8px;
			color: var(--vscode-foreground);
		}

		.header .version {
			font-size: 18px;
			color: var(--vscode-descriptionForeground);
			font-weight: 500;
		}

		.section {
			margin-bottom: 30px;
		}

		.section h2 {
			font-size: 16px;
			font-weight: 600;
			margin-bottom: 12px;
			color: var(--vscode-foreground);
			border-bottom: 1px solid var(--vscode-panel-border);
			padding-bottom: 6px;
		}

		.info-grid {
			display: grid;
			grid-template-columns: 150px 1fr;
			gap: 12px 20px;
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			padding: 16px;
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
		}

		.info-label {
			font-weight: 600;
			color: var(--vscode-descriptionForeground);
		}

		.info-value {
			color: var(--vscode-foreground);
			word-break: break-all;
		}

		.info-value code {
			background-color: var(--vscode-textCodeBlock-background);
			padding: 2px 6px;
			border-radius: 3px;
			font-family: var(--vscode-editor-font-family);
			font-size: 0.9em;
		}

		.commit-message {
			background-color: var(--vscode-textCodeBlock-background);
			padding: 16px;
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
			white-space: pre-wrap;
			font-family: var(--vscode-editor-font-family);
			font-size: 0.95em;
			color: var(--vscode-foreground);
			max-height: 300px;
			overflow-y: auto;
		}

		.stats {
			display: flex;
			gap: 20px;
			margin-bottom: 16px;
		}

		.stat-item {
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			padding: 12px 20px;
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
		}

		.stat-value {
			font-size: 24px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}

		.stat-label {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			text-transform: uppercase;
			margin-top: 4px;
		}

		.diff-stat {
			background-color: var(--vscode-textCodeBlock-background);
			padding: 16px;
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
			font-family: var(--vscode-editor-font-family);
			font-size: 0.9em;
			white-space: pre;
			overflow-x: auto;
			max-height: 400px;
			overflow-y: auto;
		}

		.file-diff {
			background-color: var(--vscode-textCodeBlock-background);
			padding: 12px 16px;
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
			margin-bottom: 12px;
		}

		.file-diff-header {
			font-family: var(--vscode-editor-font-family);
			font-weight: 600;
			color: var(--vscode-symbolIcon-fileForeground);
			margin-bottom: 8px;
		}

		.file-diff-content {
			font-family: var(--vscode-editor-font-family);
			font-size: 0.9em;
			white-space: pre;
			overflow-x: auto;
			max-height: 300px;
			overflow-y: auto;
		}

		.empty-message {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
			padding: 16px;
			text-align: center;
		}

		.insertions {
			color: var(--vscode-gitDecoration-addedResourceForeground);
		}

		.deletions {
			color: var(--vscode-gitDecoration-deletedResourceForeground);
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>${this.escapeHtml(this.version.tag)}</h1>
			<div class="version">${this.escapeHtml(this.version.version)}</div>
		</div>

		<div class="section">
			<h2>Tag Information</h2>
			<div class="info-grid">
				<div class="info-label">Tag:</div>
				<div class="info-value"><code>${this.escapeHtml(this.version.tag)}</code></div>
				
				<div class="info-label">Version:</div>
				<div class="info-value"><code>${this.escapeHtml(this.version.version)}</code></div>
				
				<div class="info-label">Commit:</div>
				<div class="info-value"><code>${this.escapeHtml(this.version.commit)}</code></div>
				
				<div class="info-label">Date:</div>
				<div class="info-value">${this.escapeHtml(this.version.date)}</div>
				
				<div class="info-label">Author:</div>
				<div class="info-value">${this.escapeHtml(details.author)}${details.authorEmail ? ` &lt;${this.escapeHtml(details.authorEmail)}&gt;` : ''}</div>
			</div>
		</div>

		<div class="section">
			<h2>Commit Message</h2>
			<div class="commit-message">${this.escapeHtml(details.fullMessage)}</div>
		</div>

		<div class="section">
			<h2>Changes Overview</h2>
			<div class="stats">
				<div class="stat-item">
					<div class="stat-value">${details.filesChanged}</div>
					<div class="stat-label">Files Changed</div>
				</div>
				<div class="stat-item insertions">
					<div class="stat-value">+${details.insertions}</div>
					<div class="stat-label">Insertions</div>
				</div>
				<div class="stat-item deletions">
					<div class="stat-value">-${details.deletions}</div>
					<div class="stat-label">Deletions</div>
				</div>
			</div>
			${details.diffStat ? `<div class="diff-stat">${this.escapeHtml(details.diffStat)}</div>` : '<div class="empty-message">No changes in this commit</div>'}
		</div>

		${details.fileDiffs.length > 0 ? `
		<div class="section">
			<h2>File Changes</h2>
			${details.fileDiffs.map(file => `
				<div class="file-diff">
					<div class="file-diff-header">${this.escapeHtml(file.name)}</div>
					<div class="file-diff-content">${this.escapeHtml(file.changes)}</div>
				</div>
			`).join('')}
		</div>
		` : ''}
	</div>
</body>
</html>`;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(text: string): string {
		const map: { [key: string]: string } = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, m => map[m]);
	}

	/**
	 * Dispose panel
	 */
	public dispose(): void {
		TagDetailsPanel.currentPanel = undefined;

		this.panel.dispose();

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}

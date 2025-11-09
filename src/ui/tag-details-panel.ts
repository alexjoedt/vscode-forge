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
		author: string;
		authorEmail: string;
		commits: Array<{
			hash: string;
			shortHash: string;
			author: string;
			date: string;
			message: string;
		}>;
		stats: {
			filesChanged: number;
			insertions: number;
			deletions: number;
			commits: number;
		};
		previousTag?: string;
	}> {
		try {
			// Get the author of the tag commit
			const author = await this.gitService.getCommitAuthor(this.version.commit);
			const authorEmail = await this.gitService.getCommitAuthorEmail(this.version.commit);

			// Find the previous tag
			const previousTag = await this.gitService.getPreviousTag(this.version.tag);

			let commits: Array<{hash: string, shortHash: string, author: string, date: string, message: string}> = [];
			let stats = { filesChanged: 0, insertions: 0, deletions: 0, commits: 0 };

			if (previousTag) {
				// Get commits between previous tag and current tag
				commits = await this.gitService.getCommitRange(previousTag, this.version.tag);
				stats = await this.gitService.getCommitRangeStats(previousTag, this.version.tag);
			} else {
				// No previous tag - this is the first tag
				// Get all commits up to this tag
				commits = [{
					hash: this.version.commit,
					shortHash: this.version.commit.substring(0, 7),
					author: author,
					date: this.version.date,
					message: this.version.message || 'Initial version'
				}];
				stats = { filesChanged: 0, insertions: 0, deletions: 0, commits: 1 };
			}

			return {
				author,
				authorEmail,
				commits,
				stats,
				previousTag
			};
		} catch (error) {
			console.error('Error fetching commit details:', error);
			return {
				author: 'Unknown',
				authorEmail: '',
				commits: [{
					hash: this.version.commit,
					shortHash: this.version.commit.substring(0, 7),
					author: 'Unknown',
					date: this.version.date,
					message: this.version.message || 'N/A'
				}],
				stats: { filesChanged: 0, insertions: 0, deletions: 0, commits: 1 },
				previousTag: undefined
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
			flex: 1;
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

		.commit-list {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}

		.commit-item {
			background-color: var(--vscode-editor-inactiveSelectionBackground);
			padding: 12px 16px;
			border-radius: 4px;
			border: 1px solid var(--vscode-panel-border);
			transition: background-color 0.1s ease;
		}

		.commit-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.commit-header {
			display: flex;
			align-items: baseline;
			gap: 12px;
			margin-bottom: 6px;
		}

		.commit-hash {
			font-family: var(--vscode-editor-font-family);
			font-size: 0.9em;
			color: var(--vscode-textLink-foreground);
			font-weight: 600;
		}

		.commit-message {
			color: var(--vscode-foreground);
			font-weight: 500;
			flex: 1;
		}

		.commit-meta {
			display: flex;
			gap: 16px;
			font-size: 0.9em;
			color: var(--vscode-descriptionForeground);
		}

		.commit-author {
			display: flex;
			align-items: center;
			gap: 4px;
		}

		.commit-date {
			display: flex;
			align-items: center;
			gap: 4px;
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
				
				${details.previousTag ? `
				<div class="info-label">Previous Tag:</div>
				<div class="info-value"><code>${this.escapeHtml(details.previousTag)}</code></div>
				` : ''}
			</div>
		</div>

		<div class="section">
			<h2>Changes Overview</h2>
			<div class="stats">
				<div class="stat-item">
					<div class="stat-value">${details.stats.commits}</div>
					<div class="stat-label">Commits</div>
				</div>
				<div class="stat-item">
					<div class="stat-value">${details.stats.filesChanged}</div>
					<div class="stat-label">Files Changed</div>
				</div>
				<div class="stat-item insertions">
					<div class="stat-value">+${details.stats.insertions}</div>
					<div class="stat-label">Insertions</div>
				</div>
				<div class="stat-item deletions">
					<div class="stat-value">-${details.stats.deletions}</div>
					<div class="stat-label">Deletions</div>
				</div>
			</div>
		</div>

		<div class="section">
			<h2>Commits ${details.previousTag ? `(${this.escapeHtml(details.previousTag)} → ${this.escapeHtml(this.version.tag)})` : ''}</h2>
			${details.commits.length > 0 ? `
			<div class="commit-list">
				${details.commits.map(commit => `
					<div class="commit-item">
						<div class="commit-header">
							<span class="commit-hash">${this.escapeHtml(commit.shortHash)}</span>
							<span class="commit-message">${this.escapeHtml(commit.message)}</span>
						</div>
						<div class="commit-meta">
							<span class="commit-author">👤 ${this.escapeHtml(commit.author)}</span>
							<span class="commit-date">📅 ${this.escapeHtml(this.formatDate(commit.date))}</span>
						</div>
					</div>
				`).join('')}
			</div>
			` : '<div class="empty-message">No commits found</div>'}
		</div>
	</div>
</body>
</html>`;
	}

	/**
	 * Format date string to a more readable format
	 */
	private formatDate(dateStr: string): string {
		try {
			const date = new Date(dateStr);
			return date.toLocaleString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch (error) {
			return dateStr;
		}
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

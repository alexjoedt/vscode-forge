/**
 * Service for Git operations
 */

import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { GitTag } from '../types/forge';

export class GitService {
	private outputChannel: vscode.OutputChannel;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Forge Git');
	}

	/**
	 * Execute git command
	 */
	private async executeGit(args: string[], cwd?: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const workingDir = cwd || this.getWorkspaceRoot();
			
			if (!workingDir) {
				reject(new Error('No workspace folder open'));
				return;
			}

			const command = `git ${args.join(' ')}`;
			this.outputChannel.appendLine(`$ ${command}`);

			// Use execFile instead of exec to avoid shell interpretation of special characters
			childProcess.execFile(
				'git',
				args,
				{ cwd: workingDir, maxBuffer: 1024 * 1024 * 10 },
				(error, stdout, stderr) => {
					if (error) {
						this.outputChannel.appendLine(`Error: ${error.message}`);
						reject(new Error(stderr || error.message));
						return;
					}

					if (stderr) {
						this.outputChannel.appendLine(stderr);
					}

					resolve(stdout.trim());
				}
			);
		});
	}

	/**
	 * Check if current directory is a git repository
	 */
	async isGitRepository(): Promise<boolean> {
		try {
			await this.executeGit(['rev-parse', '--git-dir']);
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get current commit hash
	 */
	async getCurrentCommit(): Promise<string> {
		return await this.executeGit(['rev-parse', 'HEAD']);
	}

	/**
	 * Get short commit hash
	 */
	async getShortCommit(): Promise<string> {
		return await this.executeGit(['rev-parse', '--short', 'HEAD']);
	}

	/**
	 * Check if working directory is dirty
	 */
	async isDirty(): Promise<boolean> {
		try {
			const status = await this.executeGit(['status', '--porcelain']);
			return status.length > 0;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get all tags matching prefix
	 */
	async getTags(prefix?: string): Promise<GitTag[]> {
		try {
			const pattern = prefix ? `${prefix}*` : '*';
			const output = await this.executeGit([
				'tag',
				'-l',
				pattern,
				'--sort=-version:refname',
				'--format=%(refname:short)|%(objectname:short)|%(creatordate:iso8601)|%(contents:subject)'
			]);

			if (!output) {
				return [];
			}

			const lines = output.split('\n');
			return lines.map(line => {
				const [name, commit, dateStr, message] = line.split('|');
				return {
					name,
					commit,
					date: new Date(dateStr),
					message: message || '',
					version: this.extractVersionFromTag(name, prefix)
				};
			});
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get latest tag matching prefix
	 */
	async getLatestTag(prefix?: string): Promise<GitTag | undefined> {
		const tags = await this.getTags(prefix);
		return tags.length > 0 ? tags[0] : undefined;
	}

	/**
	 * Check if tag exists
	 */
	async tagExists(tagName: string): Promise<boolean> {
		try {
			await this.executeGit(['rev-parse', tagName]);
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get current branch name
	 */
	async getCurrentBranch(): Promise<string> {
		return await this.executeGit(['rev-parse', '--abbrev-ref', 'HEAD']);
	}

	/**
	 * Extract version from tag name (remove prefix)
	 */
	private extractVersionFromTag(tagName: string, prefix?: string): string {
		if (prefix && tagName.startsWith(prefix)) {
			return tagName.substring(prefix.length);
		}
		return tagName;
	}

	/**
	 * Get commit message
	 */
	async getCommitMessage(commit: string): Promise<string> {
		try {
			return await this.executeGit(['log', '-1', '--format=%B', commit]);
		} catch (error) {
			return 'Unable to fetch commit message';
		}
	}

	/**
	 * Get commit author name
	 */
	async getCommitAuthor(commit: string): Promise<string> {
		try {
			return await this.executeGit(['log', '-1', '--format=%an', commit]);
		} catch (error) {
			return 'Unknown';
		}
	}

	/**
	 * Get commit author email
	 */
	async getCommitAuthorEmail(commit: string): Promise<string> {
		try {
			return await this.executeGit(['log', '-1', '--format=%ae', commit]);
		} catch (error) {
			return '';
		}
	}

	/**
	 * Get commit date
	 */
	async getCommitDate(commit: string): Promise<string> {
		try {
			return await this.executeGit(['log', '-1', '--format=%ai', commit]);
		} catch (error) {
			return 'Unknown';
		}
	}

	/**
	 * Get commit statistics (files changed, insertions, deletions)
	 */
	async getCommitStats(commit: string): Promise<{
		filesChanged: number;
		insertions: number;
		deletions: number;
	}> {
		try {
			const output = await this.executeGit(['show', '--stat', '--format=', commit]);
			
			// Parse the stat line (e.g., "3 files changed, 45 insertions(+), 12 deletions(-)")
			const statMatch = output.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
			
			if (statMatch) {
				return {
					filesChanged: parseInt(statMatch[1] || '0', 10),
					insertions: parseInt(statMatch[2] || '0', 10),
					deletions: parseInt(statMatch[3] || '0', 10)
				};
			}

			return { filesChanged: 0, insertions: 0, deletions: 0 };
		} catch (error) {
			return { filesChanged: 0, insertions: 0, deletions: 0 };
		}
	}

	/**
	 * Get commit diff stat (detailed file changes)
	 */
	async getCommitDiffStat(commit: string): Promise<string> {
		try {
			return await this.executeGit(['show', '--stat', '--format=', commit]);
		} catch (error) {
			return '';
		}
	}

	/**
	 * Get commit file diffs
	 */
	async getCommitFileDiffs(commit: string): Promise<Array<{name: string, changes: string}>> {
		try {
			// Get list of changed files
			const files = await this.executeGit(['diff-tree', '--no-commit-id', '--name-only', '-r', commit]);
			const fileList = files.split('\n').filter(f => f.trim());

			// Limit to first 10 files to avoid overwhelming output
			const limitedFiles = fileList.slice(0, 10);

			// Get diff for each file
			const diffs = await Promise.all(
				limitedFiles.map(async (file) => {
					try {
						const diff = await this.executeGit(['show', '--format=', `${commit}`, '--', file]);
						return { name: file, changes: diff };
					} catch (error) {
						return { name: file, changes: 'Unable to fetch diff' };
					}
				})
			);

			return diffs;
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get previous tag before a given tag
	 */
	async getPreviousTag(currentTag: string, prefix?: string): Promise<string | undefined> {
		try {
			const pattern = prefix ? `${prefix}*` : '*';
			const output = await this.executeGit([
				'tag',
				'-l',
				pattern,
				'--sort=-version:refname',
				'--format=%(refname:short)'
			]);

			if (!output) {
				return undefined;
			}

			const tags = output.split('\n').filter(t => t.trim());
			const currentIndex = tags.indexOf(currentTag);
			
			if (currentIndex === -1 || currentIndex === tags.length - 1) {
				return undefined;
			}

			return tags[currentIndex + 1];
		} catch (error) {
			return undefined;
		}
	}

	/**
	 * Get commits between two refs (tags, commits, branches)
	 */
	async getCommitRange(from: string, to: string): Promise<Array<{
		hash: string;
		shortHash: string;
		author: string;
		date: string;
		message: string;
	}>> {
		try {
			// Format: hash|shortHash|author|date|message
			const output = await this.executeGit([
				'log',
				`${from}..${to}`,
				'--format=%H|%h|%an|%ai|%s',
				'--no-merges'
			]);

			if (!output) {
				return [];
			}

			const lines = output.split('\n').filter(l => l.trim());
			return lines.map(line => {
				const [hash, shortHash, author, date, ...messageParts] = line.split('|');
				return {
					hash: hash || '',
					shortHash: shortHash || '',
					author: author || 'Unknown',
					date: date || '',
					message: messageParts.join('|') || 'No message'
				};
			});
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get total stats for a commit range
	 */
	async getCommitRangeStats(from: string, to: string): Promise<{
		filesChanged: number;
		insertions: number;
		deletions: number;
		commits: number;
	}> {
		try {
			const output = await this.executeGit(['diff', '--shortstat', from, to]);
			
			// Parse the stat line (e.g., "3 files changed, 45 insertions(+), 12 deletions(-)")
			const statMatch = output.match(/(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/);
			
			// Get commit count
			const commits = await this.getCommitRange(from, to);
			
			if (statMatch) {
				return {
					filesChanged: parseInt(statMatch[1] || '0', 10),
					insertions: parseInt(statMatch[2] || '0', 10),
					deletions: parseInt(statMatch[3] || '0', 10),
					commits: commits.length
				};
			}

			return { filesChanged: 0, insertions: 0, deletions: 0, commits: commits.length };
		} catch (error) {
			return { filesChanged: 0, insertions: 0, deletions: 0, commits: 0 };
		}
	}

	/**
	 * Get workspace root directory
	 */
	private getWorkspaceRoot(): string | undefined {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders && workspaceFolders.length > 0) {
			return workspaceFolders[0].uri.fsPath;
		}
		return undefined;
	}

	/**
	 * Show output channel
	 */
	showOutput(): void {
		this.outputChannel.show();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.outputChannel.dispose();
	}
}

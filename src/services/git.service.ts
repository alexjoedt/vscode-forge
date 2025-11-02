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

/**
 * Service for interacting with Forge CLI
 */

import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as path from 'path';
import {
	ForgeInstallation,
	VersionInfo,
	VersionHistoryResponse,
	BumpResult,
	BuildResult,
	ImageResult,
	CommandOptions,
	BumpType,
	ValidationResult,
	ChangelogResult,
	VersionNextResult
} from '../types/forge';

export class ForgeService {
	private outputChannel: vscode.OutputChannel;
	private installation: ForgeInstallation | null = null;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Forge');
	}

	/**
	 * Check if forge CLI is installed
	 */
	async checkInstallation(): Promise<ForgeInstallation> {
		if (this.installation) {
			return this.installation;
		}

		try {
			const result = await this.executeCommand(['--version'], {});
			const version = result.trim();
			
			this.installation = {
				installed: true,
				version: version,
				path: 'forge' // In PATH
			};

			return this.installation;
		} catch (error) {
			this.installation = {
				installed: false
			};
			return this.installation;
		}
	}

	/**
	 * Ensure forge is installed, show error if not
	 */
	async ensureInstalled(retryCount: number = 0): Promise<boolean> {
		const MAX_RETRIES = 1; // Only allow one installation attempt to prevent infinite loops
		
		const installation = await this.checkInstallation();
		
		if (!installation.installed) {
			// If we've already tried installing, don't ask again
			if (retryCount >= MAX_RETRIES) {
				vscode.window.showErrorMessage(
					'Forge CLI is not installed. Please install it manually.',
					'Open Documentation'
				).then(action => {
					if (action === 'Open Documentation') {
						vscode.env.openExternal(vscode.Uri.parse('https://github.com/alexjoedt/forge'));
					}
				});
				return false;
			}
			
			const action = await vscode.window.showErrorMessage(
				'Forge CLI is not installed. Would you like to install it now?',
				'Install with Go',
				'Open Documentation',
				'Cancel'
			);

			if (action === 'Install with Go') {
				const success = await this.installForge();
				if (success) {
					// Clear cached installation status and retry verification once
					this.installation = null;
					return await this.ensureInstalled(retryCount + 1);
				}
				return false;
			} else if (action === 'Open Documentation') {
				vscode.env.openExternal(vscode.Uri.parse('https://github.com/alexjoedt/forge'));
			}

			return false;
		}

		return true;
	}

	/**
	 * Install Forge CLI using go install
	 */
	async installForge(): Promise<boolean> {
		// Check if go is installed
		try {
			await new Promise<void>((resolve, reject) => {
				childProcess.exec('go version', (error) => {
					if (error) {
						reject(new Error('Go is not installed'));
					} else {
						resolve();
					}
				});
			});
		} catch (error) {
			const action = await vscode.window.showErrorMessage(
				'Go is not installed. Please install Go first.',
				'Open Go Website'
			);
			
			if (action === 'Open Go Website') {
				vscode.env.openExternal(vscode.Uri.parse('https://go.dev/doc/install'));
			}
			
			return false;
		}

		// Install forge using go install
		return await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Installing Forge CLI...',
				cancellable: false
			},
			async (progress) => {
				try {
					progress.report({ message: 'Running go install...' });
					
					await new Promise<void>((resolve, reject) => {
						const command = 'go install github.com/alexjoedt/forge@latest';
						this.outputChannel.appendLine(`$ ${command}`);

						childProcess.exec(
							command,
							{ maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
							(error, stdout, stderr) => {
								if (stderr) {
									this.outputChannel.appendLine(stderr);
								}
								if (stdout) {
									this.outputChannel.appendLine(stdout);
								}

								if (error) {
									this.outputChannel.appendLine(`Error: ${error.message}`);
									reject(new Error(stderr || error.message));
									return;
								}

								resolve();
							}
						);
					});

					progress.report({ message: 'Verifying installation...' });
					
					// Verify installation
					const verified = await this.verifyInstallation();
					
					if (verified) {
						vscode.window.showInformationMessage('Forge CLI installed successfully!');
						return true;
					} else {
						vscode.window.showWarningMessage(
							'Forge was installed but not found in PATH. You may need to restart VS Code or add $GOPATH/bin to your PATH.'
						);
						return false;
					}

				} catch (error) {
					this.outputChannel.appendLine(`Installation failed: ${error}`);
					vscode.window.showErrorMessage(`Failed to install Forge: ${error}`);
					return false;
				}
			}
		);
	}

	/**
	 * Verify forge installation
	 */
	private async verifyInstallation(): Promise<boolean> {
		try {
			// Clear cached installation
			this.installation = null;
			const installation = await this.checkInstallation();
			return installation.installed;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Execute forge command
	 */
	private async executeCommand(
		args: string[],
		options: CommandOptions & { skipJson?: boolean }
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const cwd = options.cwd || this.getWorkspaceRoot();
			
			if (!cwd) {
				reject(new Error('No workspace folder open'));
				return;
			}

			// Add global flags
			if (options.verbose) {
				args.push('--verbose');
			}
			if (options.dryRun) {
				args.push('--dry-run');
			}

			// Add JSON output for parsing (unless explicitly skipped or version check)
			if (!options.skipJson && !args.includes('--json') && !args.includes('--version')) {
				args.push('--json');
			}

			const command = `forge ${args.join(' ')}`;
			this.outputChannel.appendLine(`$ ${command}`);

			childProcess.exec(
				command,
				{ cwd, maxBuffer: 1024 * 1024 * 10 }, // 10MB buffer
				(error, stdout, stderr) => {
					if (stderr) {
						this.outputChannel.appendLine(stderr);
					}

					if (error) {
						this.outputChannel.appendLine(`Error: ${error.message}`);
						reject(new Error(stderr || error.message));
						return;
					}

					this.outputChannel.appendLine(stdout);
					resolve(stdout);
				}
			);
		});
	}

	/**
	 * Get current version
	 */
	async getVersion(options: CommandOptions = {}): Promise<VersionInfo> {
		const args = ['version'];
		
		if (options.app) {
			args.push('--app', options.app);
		}

		const output = await this.executeCommand(args, options);
		return JSON.parse(output) as VersionInfo;
	}

	/**
	 * Get version history
	 */
	async getVersionHistory(options: CommandOptions & {
		limit?: number;
	} = {}): Promise<VersionHistoryResponse> {
		const args = ['version', 'list'];
		
		if (options.app) {
			args.push('--app', options.app);
		}

		if (options.limit) {
			args.push('--limit', options.limit.toString());
		}

		const output = await this.executeCommand(args, options);
		return JSON.parse(output);
	}

	/**
	 * Preview next version
	 */
	async getNextVersion(
		bumpType: BumpType,
		options: CommandOptions = {}
	): Promise<VersionNextResult> {
		const args = ['version', 'next', '--bump', bumpType];
		
		if (options.app) {
			args.push('--app', options.app);
		}

		const output = await this.executeCommand(args, options);
		return JSON.parse(output) as VersionNextResult;
	}

	/**
	 * Create tag (bump version)
	 */
	async bump(
		bumpType: BumpType | undefined,
		options: CommandOptions & {
			initial?: string;
			scheme?: 'semver' | 'calver';
			calverFormat?: string;
			prefix?: string;
			push?: boolean;
			force?: boolean;
			pre?: string;
			meta?: string;
		} = {}
	): Promise<BumpResult> {
		const args = ['bump'];

		// Positional argument for bump type (if provided)
		if (bumpType) {
			args.push(bumpType);
		}

		if (options.app) {
			args.push('--app', options.app);
		}

		if (options.initial) {
			args.push('--initial', options.initial);
		}

		if (options.scheme) {
			args.push('--scheme', options.scheme);
		}

		if (options.calverFormat) {
			args.push('--calver-format', options.calverFormat);
		}

		if (options.prefix) {
			args.push('--prefix', options.prefix);
		}

		if (options.push) {
			args.push('--push');
		}

		if (options.force) {
			args.push('--force');
		}

		if (options.pre) {
			args.push('--pre', options.pre);
		}

		if (options.meta) {
			args.push('--meta', options.meta);
		}

		// For initial version, forge doesn't output JSON, so we skip --json flag
		const skipJson = !!options.initial;
		const output = await this.executeCommand(args, { ...options, skipJson });
		
		// If we used --initial, parse plain text output
		if (options.initial) {
			// Output format: "Created initial tag: v1.0.0"
			const tagMatch = output.match(/Created initial tag:\s*(.+)/i);
			if (tagMatch) {
				const tag = tagMatch[1].trim();
				return {
					tag,
					created: true,
					pushed: !!options.push,
					version: tag,
					message: output.trim()
				} as BumpResult;
			}
			throw new Error(`Failed to parse forge bump --initial output: ${output}`);
		}
		
		// For normal bump, parse JSON
		try {
			return JSON.parse(output) as BumpResult;
		} catch (error) {
			// Sometimes forge outputs text before JSON, try to extract JSON
			const jsonMatch = output.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				try {
					return JSON.parse(jsonMatch[0]) as BumpResult;
				} catch (e) {
					// Still failed, throw original error
					throw new Error(`Failed to parse forge bump output: ${output}`);
				}
			}
			throw new Error(`No valid JSON found in forge bump output: ${output}`);
		}
	}

	/**
	 * Build binaries
	 */
	async build(options: CommandOptions & {
		targets?: string[];
		version?: string;
	} = {}): Promise<BuildResult> {
		const args = ['build'];

		if (options.app) {
			args.push('--app', options.app);
		}

		if (options.targets && options.targets.length > 0) {
			args.push('--targets', options.targets.join(','));
		}

		if (options.version) {
			args.push('--version', options.version);
		}

		const output = await this.executeCommand(args, options);
		return JSON.parse(output) as BuildResult;
	}

	/**
	 * Build Docker image
	 */
	async buildImage(options: CommandOptions & {
		push?: boolean;
		platforms?: string[];
		buildArgs?: Record<string, string>;
	} = {}): Promise<ImageResult> {
		const args = ['docker'];

		if (options.app) {
			args.push('--app', options.app);
		}

		if (options.push) {
			args.push('--push');
		}

		if (options.platforms && options.platforms.length > 0) {
			args.push('--platforms', options.platforms.join(','));
		}

		if (options.buildArgs) {
			Object.entries(options.buildArgs).forEach(([key, value]) => {
				args.push('--build-arg', `${key}=${value}`);
			});
		}

		const output = await this.executeCommand(args, options);
		return JSON.parse(output) as ImageResult;
	}

	/**
	 * Initialize forge.yaml
	 */
	async init(options: CommandOptions & {
		multi?: boolean;
		output?: string;
		force?: boolean;
	} = {}): Promise<string> {
		const args = ['init'];

		if (options.multi) {
			args.push('--multi');
		}

		if (options.output) {
			args.push('--output', options.output);
		}

		if (options.force) {
			args.push('--force');
		}

		return await this.executeCommand(args, options);
	}

	/**
	 * Validate forge.yaml configuration
	 */
	async validate(options: CommandOptions = {}): Promise<ValidationResult> {
		const args = ['validate'];

		if (options.app) {
			args.push('--app', options.app);
		}

		const output = await this.executeCommand(args, options);
		return JSON.parse(output) as ValidationResult;
	}

	/**
	 * Generate changelog from git commits
	 */
	async changelog(options: CommandOptions & {
		from?: string;
		to?: string;
		format?: 'markdown' | 'json' | 'plain';
		output?: string;
	} = {}): Promise<ChangelogResult | string> {
		const args = ['changelog'];

		if (options.app) {
			args.push('--app', options.app);
		}

		if (options.from) {
			args.push('--from', options.from);
		}

		if (options.to) {
			args.push('--to', options.to);
		}

		if (options.format) {
			args.push('--format', options.format);
		}

		if (options.output) {
			args.push('--output', options.output);
		}

		const output = await this.executeCommand(args, options);
		
		// If format is json or not specified (defaults to markdown but can be parsed)
		if (options.format === 'json' || !options.format) {
			try {
				return JSON.parse(output) as ChangelogResult;
			} catch {
				return output; // Return raw output if not JSON
			}
		}
		
		return output;
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

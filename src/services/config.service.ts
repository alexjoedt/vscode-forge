/**
 * Service for managing forge.yaml configuration
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
	ForgeConfig,
	SingleAppConfig,
	ConfigType,
	VersionConfig
} from '../types/forge';
import {
	parseForgeConfig,
	detectConfigType,
	validateForgeConfig,
	getVersionConfig,
	getAppList,
	getDefaultApp,
	getAppConfig
} from '../utils/config-parser';

export class ConfigService {
	private static readonly CONFIG_FILES = ['forge.yaml', '.forge.yaml'];
	private configCache: Map<string, ForgeConfig> = new Map();
	private fileWatcher: vscode.FileSystemWatcher | undefined;

	constructor() {
		this.setupFileWatcher();
	}

	/**
	 * Find forge.yaml in workspace
	 */
	async findConfigFile(): Promise<vscode.Uri | undefined> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return undefined;
		}

		const rootPath = workspaceFolders[0].uri.fsPath;

		for (const configFile of ConfigService.CONFIG_FILES) {
			const configPath = path.join(rootPath, configFile);
			if (fs.existsSync(configPath)) {
				return vscode.Uri.file(configPath);
			}
		}

		return undefined;
	}

	/**
	 * Load configuration from file
	 */
	async loadConfig(): Promise<ForgeConfig | undefined> {
		const configUri = await this.findConfigFile();
		if (!configUri) {
			return undefined;
		}

		// Check cache
		const cached = this.configCache.get(configUri.fsPath);
		if (cached) {
			return cached;
		}

		try {
			const content = fs.readFileSync(configUri.fsPath, 'utf-8');
			const config = parseForgeConfig(content);
			
			// Cache the config
			this.configCache.set(configUri.fsPath, config);
			
			return config;
		} catch (error) {
			throw new Error(`Failed to load config: ${error}`);
		}
	}

	/**
	 * Get configuration type (single-app or multi-app)
	 */
	async getConfigType(): Promise<ConfigType | undefined> {
		const config = await this.loadConfig();
		if (!config) {
			return undefined;
		}

		return detectConfigType(config);
	}

	/**
	 * Get version configuration for app or single-app
	 */
	async getVersionConfig(appName?: string): Promise<VersionConfig | undefined> {
		const config = await this.loadConfig();
		if (!config) {
			return undefined;
		}

		try {
			return getVersionConfig(config, appName);
		} catch (error) {
			return undefined;
		}
	}

	/**
	 * Get list of apps (multi-app only)
	 */
	async getApps(): Promise<string[]> {
		const config = await this.loadConfig();
		if (!config) {
			return [];
		}

		return getAppList(config);
	}

	/**
	 * Get default app (multi-app only)
	 */
	async getDefaultApp(): Promise<string | undefined> {
		const config = await this.loadConfig();
		if (!config) {
			return undefined;
		}

		return getDefaultApp(config);
	}

	/**
	 * Get app configuration (multi-app only)
	 */
	async getAppConfig(appName: string): Promise<SingleAppConfig | undefined> {
		const config = await this.loadConfig();
		if (!config) {
			return undefined;
		}

		const configType = detectConfigType(config);
		if (!configType.isMultiApp) {
			return undefined;
		}

		try {
			return getAppConfig(config as any, appName);
		} catch (error) {
			return undefined;
		}
	}

	/**
	 * Validate configuration
	 */
	async validateConfig(): Promise<string[]> {
		const config = await this.loadConfig();
		if (!config) {
			return ['No forge.yaml found'];
		}

		return validateForgeConfig(config);
	}

	/**
	 * Check if configuration exists
	 */
	async hasConfig(): Promise<boolean> {
		const configUri = await this.findConfigFile();
		return configUri !== undefined;
	}

	/**
	 * Clear cache (useful after config changes)
	 */
	clearCache(): void {
		this.configCache.clear();
	}

	/**
	 * Setup file watcher for config changes
	 */
	private setupFileWatcher(): void {
		const pattern = '**/{forge.yaml,.forge.yaml}';
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.fileWatcher.onDidChange(() => this.clearCache());
		this.fileWatcher.onDidCreate(() => this.clearCache());
		this.fileWatcher.onDidDelete(() => this.clearCache());
	}

	/**
	 * Get config file URI
	 */
	async getConfigUri(): Promise<vscode.Uri | undefined> {
		return await this.findConfigFile();
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}
	}
}

/**
 * Type definitions for Forge CLI tool
 */

/**
 * Version scheme types
 */
export type VersionScheme = 'semver' | 'calver';

/**
 * SemVer bump types
 */
export type BumpType = 'major' | 'minor' | 'patch';

/**
 * Version configuration
 */
export interface VersionConfig {
	scheme: VersionScheme;
	prefix?: string;
	calver_format?: string;
	pre?: string;
	meta?: string;
}

/**
 * Build binary configuration
 */
export interface BuildBinary {
	name: string;
	path: string;
	ldflags?: string;
}

/**
 * Build configuration
 */
export interface BuildConfig {
	name?: string;
	main_path?: string;
	targets?: string[];
	ldflags?: string;
	output_dir?: string;
	binaries?: BuildBinary[];
}

/**
 * Docker configuration
 */
export interface DockerConfig {
	enabled?: boolean;
	repository?: string;
	dockerfile?: string;
	tags?: string[];
	platforms?: string[];
	build_args?: Record<string, string>;
}

/**
 * Git configuration
 */
export interface GitConfig {
	tag_prefix?: string;
	default_branch?: string;
}

/**
 * Single-app forge configuration
 */
export interface SingleAppConfig {
	version: VersionConfig;
	build?: BuildConfig;
	docker?: DockerConfig;
	git?: GitConfig;
}

/**
 * Multi-app forge configuration
 */
export interface MultiAppConfig {
	defaultApp?: string;
	[appName: string]: SingleAppConfig | string | undefined;
}

/**
 * Union type for forge configuration
 */
export type ForgeConfig = SingleAppConfig | MultiAppConfig;

/**
 * Configuration type detection result
 */
export interface ConfigType {
	isMultiApp: boolean;
	apps?: string[];
	defaultApp?: string;
}

/**
 * Version information from CLI
 */
export interface VersionInfo {
	version: string;
	scheme: VersionScheme;
	commit?: string;
	dirty?: boolean;
	message?: string;
}

/**
 * Version history entry
 */
export interface VersionHistoryEntry {
	version: string;
	tag: string;
	commit: string;
	date: string;
	message: string;
}

/**
 * Version history response
 */
export interface VersionHistoryResponse {
	versions: VersionHistoryEntry[];
	count: number;
}

/**
 * Bump result from CLI
 */
export interface BumpResult {
	tag: string;
	created: boolean;
	pushed: boolean;
	version?: string;
	message: string;
}

/**
 * Build result from CLI
 */
export interface BuildResult {
	version: string;
	commit: string;
	short_commit: string;
	date: string;
	output_dir: string;
	targets: string[];
	binaries: string[];
	message: string;
}

/**
 * Image build result from CLI
 */
export interface ImageResult {
	repository: string;
	tags: string[];
	platforms: string[];
	pushed: boolean;
	message: string;
}

/**
 * Command execution options
 */
export interface CommandOptions {
	cwd?: string;
	app?: string;
	dryRun?: boolean;
	verbose?: boolean;
}

/**
 * Git tag information
 */
export interface GitTag {
	name: string;
	commit: string;
	date: Date;
	message?: string;
	version?: string;
}

/**
 * Forge CLI check result
 */
export interface ForgeInstallation {
	installed: boolean;
	version?: string;
	path?: string;
}

/**
 * Validation issue or warning
 */
export interface ValidationIssue {
	message: string;
	type: 'error' | 'warning';
}

/**
 * Validation result from CLI
 */
export interface ValidationResult {
	valid: boolean;
	issues: string[];
	warnings: string[];
}

/**
 * Changelog commit entry
 */
export interface ChangelogCommit {
	type: string;
	scope?: string;
	message: string;
	hash: string;
	breaking?: boolean;
}

/**
 * Changelog result from CLI
 */
export interface ChangelogResult {
	from: string;
	to: string;
	commits: ChangelogCommit[];
}

/**
 * Version next preview result
 */
export interface VersionNextResult {
	current: string;
	next: string;
	bump: BumpType;
	scheme: VersionScheme;
}

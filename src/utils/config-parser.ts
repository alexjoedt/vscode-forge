/**
 * Configuration parser utilities for forge.yaml
 */

import * as yaml from 'yaml';
import {
	ForgeConfig,
	SingleAppConfig,
	MultiAppConfig,
	ConfigType,
	VersionConfig
} from '../types/forge';

/**
 * Parse YAML content to ForgeConfig
 */
export function parseForgeConfig(content: string): ForgeConfig {
	try {
		return yaml.parse(content) as ForgeConfig;
	} catch (error) {
		throw new Error(`Failed to parse forge.yaml: ${error}`);
	}
}

/**
 * Detect if configuration is multi-app or single-app
 */
export function detectConfigType(config: ForgeConfig): ConfigType {
	// Multi-app has 'defaultApp' field at root
	if ('defaultApp' in config) {
		const apps = Object.keys(config).filter(key => 
			key !== 'defaultApp' && typeof config[key] === 'object'
		);
		return {
			isMultiApp: true,
			apps,
			defaultApp: config.defaultApp
		};
	}

	// Single-app has 'version' field at root
	if ('version' in config) {
		return {
			isMultiApp: false
		};
	}

	throw new Error('Invalid forge.yaml: missing version or defaultApp field');
}

/**
 * Get app configuration from multi-app config
 */
export function getAppConfig(
	config: MultiAppConfig,
	appName: string
): SingleAppConfig {
	const appConfig = config[appName];
	
	if (!appConfig || typeof appConfig === 'string') {
		throw new Error(`App '${appName}' not found in configuration`);
	}

	return appConfig as SingleAppConfig;
}

/**
 * Get version configuration for given app (or single-app)
 */
export function getVersionConfig(
	config: ForgeConfig,
	appName?: string
): VersionConfig {
	const configType = detectConfigType(config);

	if (configType.isMultiApp) {
		if (!appName) {
			appName = (config as MultiAppConfig).defaultApp;
		}
		if (!appName) {
			throw new Error('Multi-app config requires app name');
		}
		const appConfig = getAppConfig(config as MultiAppConfig, appName);
		return appConfig.version;
	}

	return (config as SingleAppConfig).version;
}

/**
 * Validate version configuration
 */
export function validateVersionConfig(versionConfig: VersionConfig): string[] {
	const errors: string[] = [];

	// Scheme is required
	if (!versionConfig.scheme) {
		errors.push('version.scheme is required');
	} else if (versionConfig.scheme !== 'semver' && versionConfig.scheme !== 'calver') {
		errors.push('version.scheme must be "semver" or "calver"');
	}

	// CalVer requires format
	if (versionConfig.scheme === 'calver' && !versionConfig.calver_format) {
		errors.push('version.calver_format is required when scheme is "calver"');
	}

	return errors;
}

/**
 * Validate forge configuration
 */
export function validateForgeConfig(config: ForgeConfig): string[] {
	const errors: string[] = [];

	try {
		const configType = detectConfigType(config);

		if (configType.isMultiApp) {
			const multiConfig = config as MultiAppConfig;
			
			// Validate each app
			if (configType.apps && configType.apps.length === 0) {
				errors.push('Multi-app config must have at least one app');
			}

			configType.apps?.forEach(appName => {
				try {
					const appConfig = getAppConfig(multiConfig, appName);
					const versionErrors = validateVersionConfig(appConfig.version);
					versionErrors.forEach(err => errors.push(`${appName}: ${err}`));
				} catch (err) {
					errors.push(`${appName}: ${err}`);
				}
			});
		} else {
			// Validate single-app version
			const singleConfig = config as SingleAppConfig;
			errors.push(...validateVersionConfig(singleConfig.version));
		}
	} catch (err) {
		errors.push(`${err}`);
	}

	return errors;
}

/**
 * Get list of apps from multi-app config
 */
export function getAppList(config: ForgeConfig): string[] {
	const configType = detectConfigType(config);
	return configType.apps || [];
}

/**
 * Get default app from multi-app config
 */
export function getDefaultApp(config: ForgeConfig): string | undefined {
	const configType = detectConfigType(config);
	return configType.defaultApp;
}

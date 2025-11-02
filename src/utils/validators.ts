/**
 * Validation utilities
 */

import { BumpType, VersionScheme } from '../types/forge';

/**
 * Validate bump type
 */
export function isValidBumpType(value: string): value is BumpType {
	return ['major', 'minor', 'patch'].includes(value);
}

/**
 * Validate version scheme
 */
export function isValidVersionScheme(value: string): value is VersionScheme {
	return ['semver', 'calver'].includes(value);
}

/**
 * Validate template syntax (basic check for {{ }})
 */
export function validateTemplateSyntax(template: string): string[] {
	const errors: string[] = [];
	
	// Check for unmatched braces
	const openBraces = (template.match(/\{\{/g) || []).length;
	const closeBraces = (template.match(/\}\}/g) || []).length;
	
	if (openBraces !== closeBraces) {
		errors.push('Unmatched template braces {{ }}');
	}

	// Check for empty templates
	if (template.includes('{{}}')) {
		errors.push('Empty template variable {{ }}');
	}

	return errors;
}

/**
 * Validate platform target format (OS/ARCH)
 */
export function validatePlatformTarget(target: string): boolean {
	const parts = target.split('/');
	return parts.length === 2 || parts.length === 3; // OS/ARCH or OS/ARCH/VARIANT
}

/**
 * Validate CalVer format
 */
export function validateCalVerFormat(format: string): boolean {
	// Basic validation - should contain valid Go time format tokens or WW
	const validTokens = ['2006', '06', '01', '02', 'WW'];
	return validTokens.some(token => format.includes(token));
}

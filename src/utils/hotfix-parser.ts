/**
 * Parse and detect hotfix versions from version strings
 */

import { VersionHistoryEntry } from '../types/forge';

/**
 * Information about a parsed hotfix version
 */
export interface HotfixInfo {
	isHotfix: boolean;
	baseVersion?: string;
	suffix?: string;
	sequence?: number;
}

/**
 * Parse hotfix version string
 * Supports configurable suffixes (default: hotfix, patch, fix)
 * 
 * Examples:
 *   "v1.0.0-hotfix.1" → { isHotfix: true, baseVersion: "v1.0.0", suffix: "hotfix", sequence: 1 }
 *   "api/v2.0.0-patch.3" → { isHotfix: true, baseVersion: "api/v2.0.0", suffix: "patch", sequence: 3 }
 *   "v1.0.0" → { isHotfix: false }
 * 
 * @param version Version string to parse
 * @param suffixes Array of hotfix suffix patterns to recognize
 * @returns Parsed hotfix information
 */
export function parseHotfixVersion(
	version: string,
	suffixes: string[] = ['hotfix', 'patch', 'fix']
): HotfixInfo {
	// Build regex pattern from configured suffixes
	const suffixPattern = suffixes.join('|');
	const pattern = new RegExp(`^(.+)-(${suffixPattern})\\.(\\d+)$`);
	const match = version.match(pattern);
	
	if (!match) {
		return { isHotfix: false };
	}
	
	return {
		isHotfix: true,
		baseVersion: match[1],
		suffix: match[2],
		sequence: parseInt(match[3], 10)
	};
}

/**
 * Check if version string is a hotfix
 * 
 * @param version Version string to check
 * @param suffixes Array of hotfix suffix patterns to recognize
 * @returns True if version is a hotfix
 */
export function isHotfixVersion(version: string, suffixes?: string[]): boolean {
	return parseHotfixVersion(version, suffixes).isHotfix;
}

/**
 * Extract base tag from hotfix version
 * Returns undefined for non-hotfix versions
 * 
 * Example: "v1.0.0-hotfix.1" → "v1.0.0"
 * 
 * @param version Version string to parse
 * @param suffixes Array of hotfix suffix patterns to recognize
 * @returns Base version string or undefined
 */
export function getBaseTag(version: string, suffixes?: string[]): string | undefined {
	const info = parseHotfixVersion(version, suffixes);
	return info.isHotfix ? info.baseVersion : undefined;
}

/**
 * Build parent-child relationship map
 * Returns map of base version → array of hotfix tags
 * 
 * Example:
 *   Input: [
 *     { version: "v1.0.0", tag: "v1.0.0" },
 *     { version: "v1.0.0-hotfix.1", tag: "v1.0.0-hotfix.1" },
 *     { version: "v1.0.0-hotfix.2", tag: "v1.0.0-hotfix.2" }
 *   ]
 *   Output: Map { "v1.0.0" => ["v1.0.0-hotfix.1", "v1.0.0-hotfix.2"] }
 * 
 * @param versions Array of version history entries
 * @param suffixes Array of hotfix suffix patterns to recognize
 * @returns Map of base version to array of child hotfix tags
 */
export function buildHotfixRelationships(
	versions: VersionHistoryEntry[],
	suffixes?: string[]
): Map<string, string[]> {
	const relationships = new Map<string, string[]>();
	
	for (const version of versions) {
		const info = parseHotfixVersion(version.version, suffixes);
		
		if (info.isHotfix && info.baseVersion) {
			const children = relationships.get(info.baseVersion) || [];
			children.push(version.tag);
			relationships.set(info.baseVersion, children);
		}
	}
	
	// Sort children by sequence number within each parent
	for (const [baseVersion, children] of relationships.entries()) {
		children.sort((a, b) => {
			const seqA = parseHotfixVersion(a, suffixes).sequence || 0;
			const seqB = parseHotfixVersion(b, suffixes).sequence || 0;
			return seqA - seqB;
		});
		relationships.set(baseVersion, children);
	}
	
	return relationships;
}

/**
 * Enrich version history entries with hotfix metadata
 * Adds isHotfix, baseTag, hotfixSequence, and children fields
 * 
 * @param versions Array of version history entries
 * @param suffixes Array of hotfix suffix patterns to recognize
 * @returns Enriched version history entries
 */
export function enrichVersionsWithHotfixData(
	versions: VersionHistoryEntry[],
	suffixes?: string[]
): VersionHistoryEntry[] {
	// First pass: parse hotfix information
	const enriched = versions.map(v => {
		const hotfixInfo = parseHotfixVersion(v.version, suffixes);
		return {
			...v,
			isHotfix: hotfixInfo.isHotfix,
			baseTag: hotfixInfo.baseVersion,
			hotfixSequence: hotfixInfo.sequence
		};
	});
	
	// Second pass: add children arrays
	const childMap = buildHotfixRelationships(versions, suffixes);
	
	return enriched.map(v => ({
		...v,
		children: childMap.get(v.version) || []
	}));
}

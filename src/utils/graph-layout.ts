/**
 * Calculate graph layout using layered approach
 * - Main release line: horizontal axis
 * - Hotfixes: branch vertically from parent
 */

import { VersionHistoryEntry, VersionGraphNode, VersionGraphEdge } from '../types/forge';
import { parseHotfixVersion, buildHotfixRelationships, enrichVersionsWithHotfixData } from './hotfix-parser';

export interface GraphLayout {
	nodes: VersionGraphNode[];
	edges: VersionGraphEdge[];
	width: number;
	height: number;
}

export interface LayoutOptions {
	verticalSpacing?: number;    // Space between nodes on main line (vertical)
	horizontalSpacing?: number;  // Space between hotfix branches (horizontal)
	nodeRadius?: number;         // Radius of node circles
	hotfixSuffixes?: string[];   // Hotfix suffixes to recognize
}

/**
 * Default layout options
 */
const DEFAULT_OPTIONS: Required<LayoutOptions> = {
	verticalSpacing: 80,         // Vertical spacing between release versions
	horizontalSpacing: 150,      // Horizontal spacing for hotfix branches
	nodeRadius: 20,
	hotfixSuffixes: ['hotfix', 'patch', 'fix']
};

/**
 * Version graph layout calculator
 */
export class VersionGraphLayout {
	private options: Required<LayoutOptions>;
	
	constructor(options: LayoutOptions = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}
	
	/**
	 * Build graph from version history
	 * Uses hotfix-parser utility to derive relationships
	 * 
	 * @param versions Array of version history entries (newest first from API)
	 * @returns Graph layout with positioned nodes and edges
	 */
	buildGraph(versions: VersionHistoryEntry[]): GraphLayout {
		if (versions.length === 0) {
			return {
				nodes: [],
				edges: [],
				width: 0,
				height: 0
			};
		}
		
		// Enrich versions with hotfix metadata
		const enrichedVersions = enrichVersionsWithHotfixData(
			versions,
			this.options.hotfixSuffixes
		);
		
		// Debug logging
		console.log('[VersionGraphLayout] Enriched versions:', enrichedVersions.map(v => ({
			version: v.version,
			tag: v.tag,
			isHotfix: v.isHotfix,
			baseTag: v.baseTag
		})));
		
		// Build nodes and edges
		const { nodes, edges } = this.createNodesAndEdges(enrichedVersions);
		
		// Calculate positions
		this.calculatePositions(nodes, enrichedVersions);
		
		// Calculate graph bounds
		const { width, height } = this.calculateBounds(nodes);
		
		return { nodes, edges, width, height };
	}
	
	/**
	 * Create nodes and edges from enriched versions
	 */
	private createNodesAndEdges(
		versions: VersionHistoryEntry[]
	): { nodes: VersionGraphNode[], edges: VersionGraphEdge[] } {
		const nodes: VersionGraphNode[] = [];
		const edges: VersionGraphEdge[] = [];
		const nodeMap = new Map<string, VersionGraphNode>();
		
		// Create nodes
		for (const version of versions) {
			const node: VersionGraphNode = {
				id: version.tag,
				version: version.version,
				commit: version.commit,
				date: version.date,
				message: version.message,
				isHotfix: version.isHotfix || false,
				baseTag: version.baseTag,
				children: version.children || [],
				x: 0,
				y: 0
			};
			
			nodes.push(node);
			nodeMap.set(version.tag, node);
		}
		
		// Create edges between consecutive releases on main line
		const mainLineNodes = nodes.filter(n => !n.isHotfix);
		for (let i = 0; i < mainLineNodes.length - 1; i++) {
			edges.push({
				from: mainLineNodes[i].id,
				to: mainLineNodes[i + 1].id,
				isHotfix: false
			});
		}
		
		// Create edges from base versions to hotfixes
		for (const node of nodes) {
			if (node.isHotfix && node.baseTag) {
				// Find base node by matching version string
				const baseNode = Array.from(nodeMap.values()).find(n => 
					n.version === node.baseTag || n.id === node.baseTag
				);
				if (baseNode) {
					edges.push({
						from: baseNode.id,  // Use the actual node ID, not baseTag
						to: node.id,
						isHotfix: true
					});
				} else {
					console.warn(`[VersionGraphLayout] No base node found for hotfix ${node.version} with baseTag ${node.baseTag}`);
				}
			}
		}
		
		// Create edges between consecutive hotfixes with same base
		for (const node of nodes) {
			if (!node.isHotfix && node.children.length > 0) {
				// Sort children by sequence
				const sortedChildren = [...node.children].sort((a, b) => {
					const seqA = parseHotfixVersion(a, this.options.hotfixSuffixes).sequence || 0;
					const seqB = parseHotfixVersion(b, this.options.hotfixSuffixes).sequence || 0;
					return seqA - seqB;
				});
				
				// Connect consecutive hotfixes
				for (let i = 0; i < sortedChildren.length - 1; i++) {
					edges.push({
						from: sortedChildren[i],
						to: sortedChildren[i + 1],
						isHotfix: true
					});
				}
			}
		}
		
		return { nodes, edges };
	}
	
	/**
	 * Calculate node positions
	 * Vertical layout (bottom to top, newest on top):
	 * - Main line: x = 0, y = index * verticalSpacing
	 * - Hotfixes: branch horizontally to the right from their base
	 * Note: In SVG, Y increases downward, so index 0 (newest) gets smallest Y (top)
	 */
	private calculatePositions(
		nodes: VersionGraphNode[],
		versions: VersionHistoryEntry[]
	): void {
		const nodeMap = new Map<string, VersionGraphNode>();
		for (const node of nodes) {
			nodeMap.set(node.id, node);
		}
		
		// Position main line nodes (non-hotfixes) vertically from top to bottom
		const mainLineNodes = nodes.filter(n => !n.isHotfix);
		
		mainLineNodes.forEach((node, index) => {
			node.x = 0;  // Main line at x = 0
			// index 0 (newest version in array) at top (y = 0), older versions further down
			node.y = index * this.options.verticalSpacing;
		});
		
		// Position hotfix nodes
		// Group by base version and position horizontally to the right
		const hotfixGroups = new Map<string, VersionGraphNode[]>();
		
		for (const node of nodes) {
			if (node.isHotfix && node.baseTag) {
				const group = hotfixGroups.get(node.baseTag) || [];
				group.push(node);
				hotfixGroups.set(node.baseTag, group);
			} else if (node.isHotfix && !node.baseTag) {
				console.warn(`[VersionGraphLayout] Hotfix node ${node.version} has no baseTag!`);
			}
		}
		
		// Sort each group by sequence and position horizontally
		for (const [baseTag, hotfixes] of hotfixGroups.entries()) {
			// Sort by sequence number
			hotfixes.sort((a, b) => {
				const seqA = parseHotfixVersion(a.version, this.options.hotfixSuffixes).sequence || 0;
				const seqB = parseHotfixVersion(b.version, this.options.hotfixSuffixes).sequence || 0;
				return seqA - seqB;
			});
			
			// Find base node - the baseTag might be a version string, need to find matching node
			// Look for node where version matches the baseTag
			const baseNode = Array.from(nodeMap.values()).find(n => 
				n.version === baseTag || n.id === baseTag
			);
			
			if (!baseNode) {
				console.warn(`[VersionGraphLayout] Base node not found for hotfix base: ${baseTag}`);
				console.warn(`[VersionGraphLayout] Available nodes:`, Array.from(nodeMap.keys()));
				console.warn(`[VersionGraphLayout] Hotfixes in this group:`, hotfixes.map(h => h.version));
				continue;
			}
			
			console.log(`[VersionGraphLayout] Positioning hotfixes for base ${baseTag} at y=${baseNode.y}:`, hotfixes.map(h => h.version));
			
			// Position hotfixes horizontally to the right of base
			hotfixes.forEach((hotfix, index) => {
				hotfix.x = (index + 1) * this.options.horizontalSpacing;
				hotfix.y = baseNode.y;  // Same y-level as base
			});
		}
		
		// Handle orphaned hotfixes (no base node found) - position them at the end
		const orphanedHotfixes = nodes.filter(n => n.isHotfix && n.x === 0 && n.y === 0);
		if (orphanedHotfixes.length > 0) {
			console.warn(`[VersionGraphLayout] Found ${orphanedHotfixes.length} orphaned hotfixes:`, orphanedHotfixes.map(h => h.version));
			// Position orphaned hotfixes at the bottom
			const maxY = Math.max(...mainLineNodes.map(n => n.y), 0);
			orphanedHotfixes.forEach((hotfix, index) => {
				hotfix.x = this.options.horizontalSpacing;
				hotfix.y = maxY + (index + 1) * this.options.verticalSpacing;
			});
		}
	}
	
	/**
	 * Calculate graph bounds
	 */
	private calculateBounds(nodes: VersionGraphNode[]): { width: number, height: number } {
		if (nodes.length === 0) {
			return { width: 0, height: 0 };
		}
		
		let maxX = 0;
		let maxY = 0;
		
		for (const node of nodes) {
			maxX = Math.max(maxX, node.x);
			maxY = Math.max(maxY, node.y);
		}
		
		// Add padding for node size and labels
		// More horizontal padding for labels, more vertical padding for spacing
		const horizontalPadding = 200;  // Space for version labels on the right
		const verticalPadding = 100;    // Top and bottom padding
		
		return {
			width: maxX + horizontalPadding,
			height: maxY + verticalPadding
		};
	}
}

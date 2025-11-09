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
	 * @param versions Array of version history entries (should be sorted by date, oldest first)
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
				const baseNode = nodeMap.get(node.baseTag);
				if (baseNode) {
					edges.push({
						from: node.baseTag,
						to: node.id,
						isHotfix: true
					});
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
	 * - Main line: x = 0, y = (totalReleases - index - 1) * verticalSpacing
	 * - Hotfixes: branch horizontally to the right from their base
	 */
	private calculatePositions(
		nodes: VersionGraphNode[],
		versions: VersionHistoryEntry[]
	): void {
		const nodeMap = new Map<string, VersionGraphNode>();
		for (const node of nodes) {
			nodeMap.set(node.id, node);
		}
		
		// Position main line nodes (non-hotfixes) vertically from bottom to top
		const mainLineNodes = nodes.filter(n => !n.isHotfix);
		const totalReleases = mainLineNodes.length;
		
		mainLineNodes.forEach((node, index) => {
			node.x = 0;  // Main line at x = 0
			// Reverse order: newest (index 0) at top (highest y), oldest at bottom (y = 0)
			node.y = (totalReleases - index - 1) * this.options.verticalSpacing;
		});
		
		// Position hotfix nodes
		// Group by base version and position horizontally to the right
		const hotfixGroups = new Map<string, VersionGraphNode[]>();
		
		for (const node of nodes) {
			if (node.isHotfix && node.baseTag) {
				const group = hotfixGroups.get(node.baseTag) || [];
				group.push(node);
				hotfixGroups.set(node.baseTag, group);
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
			
			// Get base node position
			const baseNode = nodeMap.get(baseTag);
			if (!baseNode) {
				continue;
			}
			
			// Position hotfixes horizontally to the right of base
			hotfixes.forEach((hotfix, index) => {
				hotfix.x = (index + 1) * this.options.horizontalSpacing;
				hotfix.y = baseNode.y;  // Same y-level as base
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

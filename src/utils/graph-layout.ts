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
	horizontalSpacing?: number;  // Space between nodes on main line
	verticalSpacing?: number;    // Space between hotfix levels
	nodeRadius?: number;         // Radius of node circles
	hotfixSuffixes?: string[];   // Hotfix suffixes to recognize
}

/**
 * Default layout options
 */
const DEFAULT_OPTIONS: Required<LayoutOptions> = {
	horizontalSpacing: 150,
	verticalSpacing: 80,
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
	 * Main line: y = 0, x = index * spacing
	 * Hotfixes: y = depth * spacing, x = parent.x
	 */
	private calculatePositions(
		nodes: VersionGraphNode[],
		versions: VersionHistoryEntry[]
	): void {
		const nodeMap = new Map<string, VersionGraphNode>();
		for (const node of nodes) {
			nodeMap.set(node.id, node);
		}
		
		// Position main line nodes (non-hotfixes)
		const mainLineNodes = nodes.filter(n => !n.isHotfix);
		mainLineNodes.forEach((node, index) => {
			node.x = index * this.options.horizontalSpacing;
			node.y = 0;
		});
		
		// Position hotfix nodes
		// Group by base version and stack vertically
		const hotfixGroups = new Map<string, VersionGraphNode[]>();
		
		for (const node of nodes) {
			if (node.isHotfix && node.baseTag) {
				const group = hotfixGroups.get(node.baseTag) || [];
				group.push(node);
				hotfixGroups.set(node.baseTag, group);
			}
		}
		
		// Sort each group by sequence and position
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
			
			// Position hotfixes vertically below base
			hotfixes.forEach((hotfix, index) => {
				hotfix.x = baseNode.x;
				hotfix.y = (index + 1) * this.options.verticalSpacing;
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
		const padding = this.options.nodeRadius * 4;
		return {
			width: maxX + padding,
			height: maxY + padding
		};
	}
}

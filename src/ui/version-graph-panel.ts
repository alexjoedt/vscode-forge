/**
 * Version Graph Panel - SVG-based graph visualization in a webview
 */

import * as vscode from 'vscode';
import { VersionHistoryEntry } from '../types/forge';
import { VersionGraphLayout, LayoutOptions } from '../utils/graph-layout';

/**
 * Manages the version graph webview panel
 */
export class VersionGraphPanel {
	public static currentPanel: VersionGraphPanel | undefined;
	private static readonly viewType = 'forgeVersionGraph';
	
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private disposables: vscode.Disposable[] = [];
	private versions: VersionHistoryEntry[];
	private layoutOptions: LayoutOptions;
	
	/**
	 * Show or reveal the graph panel
	 */
	public static async show(
		extensionUri: vscode.Uri,
		versions: VersionHistoryEntry[],
		layoutOptions?: LayoutOptions
	): Promise<void> {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;
		
		// If we already have a panel, show it
		if (VersionGraphPanel.currentPanel) {
			VersionGraphPanel.currentPanel.panel.reveal(column);
			VersionGraphPanel.currentPanel.update(versions, layoutOptions);
			return;
		}
		
		// Create new panel
		const panel = vscode.window.createWebviewPanel(
			VersionGraphPanel.viewType,
			'Version Graph',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);
		
		VersionGraphPanel.currentPanel = new VersionGraphPanel(
			panel,
			extensionUri,
			versions,
			layoutOptions
		);
	}
	
	private constructor(
		panel: vscode.WebviewPanel,
		extensionUri: vscode.Uri,
		versions: VersionHistoryEntry[],
		layoutOptions?: LayoutOptions
	) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.versions = versions;
		this.layoutOptions = layoutOptions || {};
		
		// Set initial content
		this.update(versions, layoutOptions);
		
		// Listen for when the panel is disposed
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		
		// Handle messages from the webview
		this.panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'showTagDetails':
						this.handleShowTagDetails(message.tag);
						break;
					case 'copyTag':
						this.handleCopyTag(message.tag);
						break;
					case 'checkoutTag':
						this.handleCheckoutTag(message.tag);
						break;
				}
			},
			null,
			this.disposables
		);
	}
	
	/**
	 * Update the webview content
	 */
	public update(versions: VersionHistoryEntry[], layoutOptions?: LayoutOptions): void {
		this.versions = versions;
		if (layoutOptions) {
			this.layoutOptions = layoutOptions;
		}
		this.panel.webview.html = this.getHtmlContent();
	}
	
	/**
	 * Dispose of the panel
	 */
	public dispose(): void {
		VersionGraphPanel.currentPanel = undefined;
		
		this.panel.dispose();
		
		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
	
	/**
	 * Handle show tag details message
	 */
	private async handleShowTagDetails(tag: string): Promise<void> {
		// Fire command to show tag details in the existing panel
		await vscode.commands.executeCommand('forge.showTagDetails', tag);
	}
	
	/**
	 * Handle copy tag message
	 */
	private async handleCopyTag(tag: string): Promise<void> {
		await vscode.env.clipboard.writeText(tag);
		vscode.window.showInformationMessage(`Copied tag: ${tag}`);
	}
	
	/**
	 * Handle checkout tag message
	 */
	private async handleCheckoutTag(tag: string): Promise<void> {
		const confirm = await vscode.window.showWarningMessage(
			`Checkout tag ${tag}? This will detach HEAD.`,
			{ modal: true },
			'Checkout'
		);
		
		if (confirm === 'Checkout') {
			await vscode.commands.executeCommand('forge.checkoutTag', tag);
		}
	}
	
	/**
	 * Generate HTML content with SVG graph
	 */
	private getHtmlContent(): string {
		const webview = this.panel.webview;
		
		// Build graph layout
		const layout = new VersionGraphLayout(this.layoutOptions);
		const graph = layout.buildGraph(this.versions);
		
		// Generate SVG
		const svg = this.generateSvg(graph);
		
		// Get VS Code theme colors
		const nonce = this.getNonce();
		
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Version Graph</title>
	<style>
		body {
			padding: 0;
			margin: 0;
			overflow: auto;
			background: linear-gradient(135deg, 
				var(--vscode-editor-background) 0%, 
				color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-charts-blue) 5%) 100%);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
			min-height: 100vh;
		}
		
		.container {
			width: 100%;
			min-height: 100vh;
			padding: 30px 50px;
			box-sizing: border-box;
		}
		
		.graph-container {
			display: inline-block;
			min-width: 100%;
			background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent 20%);
			border-radius: 12px;
			padding: 20px;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		}
		
		svg {
			display: block;
			filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
		}
		
		.node-release {
			fill: var(--vscode-charts-blue);
			stroke: var(--vscode-charts-blue);
			stroke-width: 3px;
			cursor: pointer;
			transition: fill 0.2s, stroke 0.2s, stroke-width 0.2s, filter 0.2s;
			filter: drop-shadow(0 2px 6px rgba(0, 100, 200, 0.3));
		}
		
		.node-release:hover {
			fill: var(--vscode-charts-purple);
			stroke: var(--vscode-charts-purple);
			stroke-width: 4.5px;
			filter: drop-shadow(0 4px 12px rgba(100, 50, 200, 0.5));
		}
		
		.node-hotfix {
			fill: var(--vscode-charts-orange);
			stroke: var(--vscode-charts-orange);
			stroke-width: 3px;
			cursor: pointer;
			transition: fill 0.2s, stroke 0.2s, stroke-width 0.2s, filter 0.2s;
			filter: drop-shadow(0 2px 6px rgba(200, 100, 0, 0.3));
		}
		
		.node-hotfix:hover {
			fill: var(--vscode-charts-red);
			stroke: var(--vscode-charts-red);
			stroke-width: 4.5px;
			filter: drop-shadow(0 4px 12px rgba(200, 50, 50, 0.5));
		}
		
		.edge-release {
			stroke: var(--vscode-foreground);
			stroke-width: 2.5px;
			fill: none;
			opacity: 0.3;
			stroke-linecap: round;
			transition: all 0.2s;
		}
		
		.edge-hotfix {
			stroke: var(--vscode-charts-orange);
			stroke-width: 2.5px;
			stroke-dasharray: 8, 4;
			fill: none;
			opacity: 0.6;
			stroke-linecap: round;
			transition: all 0.2s;
			filter: drop-shadow(0 1px 3px rgba(200, 100, 0, 0.2));
		}
		
		.node-label {
			fill: var(--vscode-foreground);
			font-size: 14px;
			font-weight: 600;
			text-anchor: start;
			pointer-events: none;
			user-select: none;
			text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		}
		
		.node-commit {
			fill: var(--vscode-descriptionForeground);
			font-size: 11px;
			font-family: var(--vscode-editor-font-family, monospace);
			text-anchor: start;
			pointer-events: none;
			user-select: none;
			opacity: 0.8;
		}
		
		.tooltip {
			position: absolute;
			background: linear-gradient(135deg, 
				var(--vscode-editorHoverWidget-background) 0%, 
				color-mix(in srgb, var(--vscode-editorHoverWidget-background) 95%, var(--vscode-charts-blue) 5%) 100%);
			border: 1px solid var(--vscode-editorHoverWidget-border);
			padding: 12px 14px;
			border-radius: 8px;
			pointer-events: none;
			z-index: 2000;
			font-size: 12px;
			display: none;
			max-width: 320px;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2);
			backdrop-filter: blur(10px);
		}
		
		.tooltip-title {
			font-weight: 700;
			font-size: 13px;
			margin-bottom: 6px;
			color: var(--vscode-foreground);
		}
		
		.tooltip-info {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			line-height: 1.5;
		}
		
		.legend {
			position: fixed;
			top: 30px;
			right: 30px;
			background: linear-gradient(135deg, 
				color-mix(in srgb, var(--vscode-editor-background) 90%, transparent 10%) 0%, 
				color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-charts-blue) 5%) 100%);
			border: 1px solid color-mix(in srgb, var(--vscode-panel-border) 70%, transparent 30%);
			padding: 14px 16px;
			border-radius: 10px;
			font-size: 12px;
			z-index: 1000;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
			backdrop-filter: blur(10px);
		}
		
		.legend-item {
			display: flex;
			align-items: center;
			gap: 10px;
			margin: 6px 0;
			transition: transform 0.2s;
		}
		
		.legend-item:hover {
			transform: translateX(2px);
		}
		
		.legend-circle {
			width: 14px;
			height: 14px;
			border-radius: 50%;
			border: none;
			box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		}
		
		.legend-release {
			background-color: var(--vscode-charts-blue);
		}
		
		.legend-hotfix {
			background-color: var(--vscode-charts-orange);
		}
		
		.context-menu {
			position: absolute;
			background: linear-gradient(135deg, 
				var(--vscode-menu-background) 0%, 
				color-mix(in srgb, var(--vscode-menu-background) 98%, var(--vscode-charts-blue) 2%) 100%);
			border: 1px solid var(--vscode-menu-border);
			border-radius: 8px;
			padding: 6px 0;
			z-index: 3000;
			display: none;
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 2px 8px rgba(0, 0, 0, 0.2);
			backdrop-filter: blur(10px);
			min-width: 160px;
		}
		
		.context-menu-item {
			padding: 8px 20px;
			cursor: pointer;
			font-size: 12px;
			transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
			border-left: 3px solid transparent;
		}
		
		.context-menu-item:hover {
			background-color: var(--vscode-menu-selectionBackground);
			color: var(--vscode-menu-selectionForeground);
			border-left-color: var(--vscode-charts-blue);
			padding-left: 22px;
		}
	</style>
</head>
<body>
	<div class="container" id="container">
		<div class="graph-container" id="graph-container">
			${svg}
		</div>
		
		<div class="legend">
			<div class="legend-item">
				<div class="legend-circle legend-release"></div>
				<span>Release</span>
			</div>
			<div class="legend-item">
				<div class="legend-circle legend-hotfix"></div>
				<span>Hotfix</span>
			</div>
		</div>
		
		<div class="tooltip" id="tooltip"></div>
		<div class="context-menu" id="context-menu"></div>
	</div>
	
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		let currentTag = null;
		
		// Node interactions
		const nodes = document.querySelectorAll('.graph-node');
		const tooltip = document.getElementById('tooltip');
		const contextMenu = document.getElementById('context-menu');
		
		nodes.forEach(node => {
			const tag = node.getAttribute('data-tag');
			const version = node.getAttribute('data-version');
			const commit = node.getAttribute('data-commit');
			const date = node.getAttribute('data-date');
			const message = node.getAttribute('data-message');
			
			// Click to show details
			node.addEventListener('click', (e) => {
				e.stopPropagation();
				vscode.postMessage({
					command: 'showTagDetails',
					tag: tag
				});
			});
			
			// Hover tooltip
			node.addEventListener('mouseenter', (e) => {
				tooltip.innerHTML = \`
					<div class="tooltip-title">\${version}</div>
					<div class="tooltip-info">Commit: \${commit.substring(0, 8)}</div>
					<div class="tooltip-info">Date: \${new Date(date).toLocaleDateString()}</div>
					<div class="tooltip-info">\${message}</div>
				\`;
				tooltip.style.display = 'block';
			});
			
			node.addEventListener('mousemove', (e) => {
				tooltip.style.left = (e.pageX + 10) + 'px';
				tooltip.style.top = (e.pageY + 10) + 'px';
			});
			
			node.addEventListener('mouseleave', () => {
				tooltip.style.display = 'none';
			});
			
			// Right-click context menu
			node.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				currentTag = tag;
				
				contextMenu.innerHTML = \`
					<div class="context-menu-item" data-action="copy">Copy Tag</div>
					<div class="context-menu-item" data-action="checkout">Checkout Tag</div>
					<div class="context-menu-item" data-action="details">Show Details</div>
				\`;
				
				contextMenu.style.display = 'block';
				contextMenu.style.left = e.pageX + 'px';
				contextMenu.style.top = e.pageY + 'px';
			});
		});
		
		// Context menu actions
		document.addEventListener('click', (e) => {
			if (!e.target.closest('.context-menu')) {
				contextMenu.style.display = 'none';
			}
			
			if (e.target.classList.contains('context-menu-item')) {
				const action = e.target.getAttribute('data-action');
				
				switch (action) {
					case 'copy':
						vscode.postMessage({ command: 'copyTag', tag: currentTag });
						break;
					case 'checkout':
						vscode.postMessage({ command: 'checkoutTag', tag: currentTag });
						break;
					case 'details':
						vscode.postMessage({ command: 'showTagDetails', tag: currentTag });
						break;
				}
				
				contextMenu.style.display = 'none';
			}
		});
	</script>
</body>
</html>`;
	}
	
	/**
	 * Generate SVG markup for the graph
	 * Vertical layout: main line from bottom to top, hotfixes branch right
	 */
	private generateSvg(graph: { nodes: any[], edges: any[], width: number, height: number }): string {
		const { nodes, edges, width, height } = graph;
		
		// Add left margin for the graph
		const leftMargin = 60;
		const topMargin = 40;
		
		// Adjust all node positions
		nodes.forEach(node => {
			node.x += leftMargin;
			node.y += topMargin;
		});
		
		// Generate edges with curved paths for better visualization
		const edgesSvg = edges.map(edge => {
			const fromNode = nodes.find(n => n.id === edge.from);
			const toNode = nodes.find(n => n.id === edge.to);
			
			if (!fromNode || !toNode) {
				return '';
			}
			
			const className = edge.isHotfix ? 'edge-hotfix' : 'edge-release';
			
			// For vertical main line edges (straight line)
			if (!edge.isHotfix) {
				return `<line x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}" class="${className}" />`;
			}
			
			// For hotfix branches (smooth bezier curve)
			// Create a horizontal curve from base to hotfix node
			const dx = toNode.x - fromNode.x;
			const dy = toNode.y - fromNode.y;
			
			// Use cubic bezier with horizontal control points for smooth branching
			// Control points keep the curve horizontal and smooth
			const cp1x = fromNode.x + dx * 0.4;  // First control point closer to start
			const cp1y = fromNode.y;              // Same Y as start (horizontal)
			const cp2x = toNode.x - dx * 0.2;     // Second control point closer to end
			const cp2y = toNode.y;                // Same Y as end (horizontal)
			
			const path = `M ${fromNode.x} ${fromNode.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toNode.x} ${toNode.y}`;
			
			return `<path d="${path}" class="${className}" />`;
		}).join('\n');
		
		// Generate nodes (circles only) - these should be clickable
		const nodeCirclesSvg = nodes.map(node => {
			const className = node.isHotfix ? 'node-hotfix' : 'node-release';
			const nodeRadius = 10;
			
			return `
				<circle cx="${node.x}" cy="${node.y}" r="${nodeRadius}" class="${className} graph-node" 
					data-tag="${this.escapeHtml(node.id)}" 
					data-version="${this.escapeHtml(node.version)}" 
					data-commit="${this.escapeHtml(node.commit)}" 
					data-date="${this.escapeHtml(node.date)}" 
					data-message="${this.escapeHtml(node.message)}" />
			`;
		}).join('\n');
		
		// Generate labels (text) - these should appear above edges and not interfere with hover
		const labelsSvg = nodes.map(node => {
			const labelClass = node.isHotfix ? 'node-label hotfix-label' : 'node-label';
			const commitClass = node.isHotfix ? 'node-commit hotfix-commit' : 'node-commit';
			
			// Position labels to the right of the node
			const nodeRadius = 10;
			const labelX = node.x + nodeRadius + 20;
			const labelY = node.y + 6;
			const commitY = node.y + 20;
			
			return `
				<g class="label-group" pointer-events="none">
					<text x="${labelX}" y="${labelY}" class="${labelClass}">${this.escapeHtml(node.version)}</text>
					<text x="${labelX}" y="${commitY}" class="${commitClass}">${this.escapeHtml(node.commit.substring(0, 7))}</text>
				</g>
			`;
		}).join('\n');
		
		return `
			<svg width="${width + leftMargin + 40}" height="${height + topMargin + 40}" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<!-- Glow filters for nodes -->
					<filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="2" result="coloredBlur"/>
						<feMerge>
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>
					<filter id="glow-orange" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="2" result="coloredBlur"/>
						<feMerge>
							<feMergeNode in="coloredBlur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>
				</defs>
				<!-- Render order: edges first, then nodes, then labels on top -->
				${edgesSvg}
				${nodeCirclesSvg}
				${labelsSvg}
			</svg>
		`;
	}
	
	/**
	 * Escape HTML for safe rendering
	 */
	private escapeHtml(text: string): string {
		const map: { [key: string]: string } = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return text.replace(/[&<>"']/g, m => map[m]);
	}
	
	/**
	 * Generate a nonce for CSP
	 */
	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}

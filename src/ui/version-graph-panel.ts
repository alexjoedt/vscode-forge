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
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
		}
		
		.container {
			width: 100%;
			min-height: 100vh;
			padding: 20px 40px;
			box-sizing: border-box;
		}
		
		.graph-container {
			display: inline-block;
			min-width: 100%;
		}
		
		svg {
			display: block;
		}
		
		.node-release {
			fill: var(--vscode-charts-blue);
			stroke: var(--vscode-foreground);
			stroke-width: 2px;
			cursor: pointer;
			transition: all 0.2s;
		}
		
		.node-release:hover {
			fill: var(--vscode-charts-purple);
			stroke-width: 3px;
		}
		
		.node-hotfix {
			fill: var(--vscode-charts-orange);
			stroke: var(--vscode-foreground);
			stroke-width: 2px;
			cursor: pointer;
			transition: all 0.2s;
		}
		
		.node-hotfix:hover {
			fill: var(--vscode-charts-red);
			stroke-width: 3px;
		}
		
		.edge-release {
			stroke: var(--vscode-foreground);
			stroke-width: 2px;
			fill: none;
			opacity: 0.6;
		}
		
		.edge-hotfix {
			stroke: var(--vscode-charts-orange);
			stroke-width: 1.5px;
			stroke-dasharray: 5, 5;
			fill: none;
			opacity: 0.6;
		}
		
		.node-label {
			fill: var(--vscode-foreground);
			font-size: 13px;
			font-weight: 500;
			text-anchor: start;
			pointer-events: none;
			user-select: none;
		}
		
		.node-commit {
			fill: var(--vscode-descriptionForeground);
			font-size: 11px;
			text-anchor: start;
			pointer-events: none;
			user-select: none;
		}
		
		.tooltip {
			position: absolute;
			background-color: var(--vscode-editorHoverWidget-background);
			border: 1px solid var(--vscode-editorHoverWidget-border);
			padding: 8px;
			border-radius: 4px;
			pointer-events: none;
			z-index: 2000;
			font-size: 12px;
			display: none;
			max-width: 300px;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}
		
		.tooltip-title {
			font-weight: bold;
			margin-bottom: 4px;
		}
		
		.tooltip-info {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}
		
		.legend {
			position: fixed;
			top: 20px;
			right: 20px;
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			padding: 10px 12px;
			border-radius: 4px;
			font-size: 12px;
			z-index: 1000;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		}
		
		.legend-item {
			display: flex;
			align-items: center;
			gap: 8px;
			margin: 4px 0;
		}
		
		.legend-circle {
			width: 12px;
			height: 12px;
			border-radius: 50%;
			border: 2px solid var(--vscode-foreground);
		}
		
		.legend-release {
			background-color: var(--vscode-charts-blue);
		}
		
		.legend-hotfix {
			background-color: var(--vscode-charts-orange);
		}
		
		.context-menu {
			position: absolute;
			background-color: var(--vscode-menu-background);
			border: 1px solid var(--vscode-menu-border);
			border-radius: 4px;
			padding: 4px 0;
			z-index: 3000;
			display: none;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}
		
		.context-menu-item {
			padding: 6px 20px;
			cursor: pointer;
			font-size: 12px;
		}
		
		.context-menu-item:hover {
			background-color: var(--vscode-menu-selectionBackground);
			color: var(--vscode-menu-selectionForeground);
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
			
			// For hotfix branches (curved path)
			// Create a smooth curve from base to hotfix
			const dx = toNode.x - fromNode.x;
			const dy = toNode.y - fromNode.y;
			
			// Use cubic bezier curve for smooth branching
			const controlPointOffset = Math.abs(dx) * 0.5;
			const path = `M ${fromNode.x} ${fromNode.y} C ${fromNode.x + controlPointOffset} ${fromNode.y}, ${toNode.x - controlPointOffset} ${toNode.y}, ${toNode.x} ${toNode.y}`;
			
			return `<path d="${path}" class="${className}" />`;
		}).join('\n');
		
		// Generate nodes with labels positioned to the right
		const nodesSvg = nodes.map(node => {
			const className = node.isHotfix ? 'node-hotfix' : 'node-release';
			const labelClass = node.isHotfix ? 'node-label hotfix-label' : 'node-label';
			const commitClass = node.isHotfix ? 'node-commit hotfix-commit' : 'node-commit';
			
			// Position labels to the right of the node
			const labelX = node.x + 30;
			const labelY = node.y + 5;
			const commitY = node.y + 18;
			
			return `
				<g class="graph-node" data-tag="${this.escapeHtml(node.id)}" data-version="${this.escapeHtml(node.version)}" data-commit="${this.escapeHtml(node.commit)}" data-date="${this.escapeHtml(node.date)}" data-message="${this.escapeHtml(node.message)}">
					<circle cx="${node.x}" cy="${node.y}" r="8" class="${className}" />
					<text x="${labelX}" y="${labelY}" class="${labelClass}">${this.escapeHtml(node.version)}</text>
					<text x="${labelX}" y="${commitY}" class="${commitClass}">${this.escapeHtml(node.commit.substring(0, 7))}</text>
				</g>
			`;
		}).join('\n');
		
		return `
			<svg width="${width + leftMargin + 40}" height="${height + topMargin + 40}" xmlns="http://www.w3.org/2000/svg">
				${edgesSvg}
				${nodesSvg}
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

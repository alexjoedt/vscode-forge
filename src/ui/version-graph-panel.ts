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
			overflow: hidden;
			background-color: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			font-family: var(--vscode-font-family);
		}
		
		.container {
			width: 100%;
			height: 100vh;
			overflow: auto;
			position: relative;
		}
		
		.controls {
			position: fixed;
			top: 10px;
			right: 10px;
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			padding: 8px;
			border-radius: 4px;
			z-index: 1000;
			display: flex;
			gap: 8px;
			align-items: center;
		}
		
		.controls button {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 4px 12px;
			cursor: pointer;
			border-radius: 2px;
			font-size: 12px;
		}
		
		.controls button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.controls label {
			font-size: 12px;
			display: flex;
			align-items: center;
			gap: 4px;
			cursor: pointer;
		}
		
		.graph-container {
			padding: 80px 40px 40px 40px;
			min-width: 100%;
			display: inline-block;
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
			font-size: 12px;
			text-anchor: middle;
			pointer-events: none;
			user-select: none;
		}
		
		.node-commit {
			fill: var(--vscode-descriptionForeground);
			font-size: 10px;
			text-anchor: middle;
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
			bottom: 10px;
			left: 10px;
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-panel-border);
			padding: 8px;
			border-radius: 4px;
			font-size: 12px;
			z-index: 1000;
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
		<div class="controls">
			<button id="zoom-in">+</button>
			<button id="zoom-out">−</button>
			<button id="reset-view">Reset View</button>
			<label>
				<input type="checkbox" id="show-hotfixes" checked>
				Show Hotfixes
			</label>
		</div>
		
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
		let scale = 1;
		let currentTag = null;
		
		// Zoom controls
		document.getElementById('zoom-in').addEventListener('click', () => {
			scale = Math.min(scale + 0.2, 3);
			updateZoom();
		});
		
		document.getElementById('zoom-out').addEventListener('click', () => {
			scale = Math.max(scale - 0.2, 0.5);
			updateZoom();
		});
		
		document.getElementById('reset-view').addEventListener('click', () => {
			scale = 1;
			updateZoom();
			document.getElementById('container').scrollTop = 0;
			document.getElementById('container').scrollLeft = 0;
		});
		
		function updateZoom() {
			const graphContainer = document.getElementById('graph-container');
			graphContainer.style.transform = \`scale(\${scale})\`;
			graphContainer.style.transformOrigin = 'top left';
		}
		
		// Toggle hotfixes
		document.getElementById('show-hotfixes').addEventListener('change', (e) => {
			const hotfixElements = document.querySelectorAll('.node-hotfix, .edge-hotfix, .hotfix-label, .hotfix-commit');
			hotfixElements.forEach(el => {
				el.style.display = e.target.checked ? '' : 'none';
			});
		});
		
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
	 */
	private generateSvg(graph: { nodes: any[], edges: any[], width: number, height: number }): string {
		const { nodes, edges, width, height } = graph;
		
		// Generate edges
		const edgesSvg = edges.map(edge => {
			const fromNode = nodes.find(n => n.id === edge.from);
			const toNode = nodes.find(n => n.id === edge.to);
			
			if (!fromNode || !toNode) {
				return '';
			}
			
			const className = edge.isHotfix ? 'edge-hotfix' : 'edge-release';
			
			// Draw line from center of from node to center of to node
			return `<line x1="${fromNode.x}" y1="${fromNode.y}" x2="${toNode.x}" y2="${toNode.y}" class="${className}" />`;
		}).join('\n');
		
		// Generate nodes
		const nodesSvg = nodes.map(node => {
			const className = node.isHotfix ? 'node-hotfix' : 'node-release';
			const labelClass = node.isHotfix ? 'node-label hotfix-label' : 'node-label';
			const commitClass = node.isHotfix ? 'node-commit hotfix-commit' : 'node-commit';
			
			return `
				<g class="graph-node" data-tag="${this.escapeHtml(node.id)}" data-version="${this.escapeHtml(node.version)}" data-commit="${this.escapeHtml(node.commit)}" data-date="${this.escapeHtml(node.date)}" data-message="${this.escapeHtml(node.message)}">
					<circle cx="${node.x}" cy="${node.y}" r="20" class="${className}" />
					<text x="${node.x}" y="${node.y + 40}" class="${labelClass}">${this.escapeHtml(node.version)}</text>
					<text x="${node.x}" y="${node.y + 55}" class="${commitClass}">${this.escapeHtml(node.commit.substring(0, 7))}</text>
				</g>
			`;
		}).join('\n');
		
		return `
			<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
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

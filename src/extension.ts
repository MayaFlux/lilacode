import * as vscode from "vscode";
import { LilaClient } from "./client";
import { LilaServer } from "./server";

export class LilaSession {
    private client: LilaClient;
    private server: LilaServer;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        const config = vscode.workspace.getConfiguration("lila");

        this.outputChannel = vscode.window.createOutputChannel("Lila");
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
        this.statusBarItem.text = "$(circle-slash) Lila";

        this.server = new LilaServer({
            serverPath: config.get("serverPath", "lila_server"),
            onOutput: (data: string) => {
                this.outputChannel.append(`[Server] ${data}\n`);
            },
        });

        this.client = new LilaClient({
            host: config.get("host", "127.0.0.1"),
            port: config.get("port", 9090),
            onResponse: (response: any) => {
                this.handleResponse(response);
            },
            onStateChange: (state: string) => {
                this.updateStatusBar();
            },
        });

        this.updateStatusBar();
        this.statusBarItem.show();

        // Auto-start if configured
        if (config.get("autoStartServer", true)) {
            setTimeout(() => this.startServer(), 1000);
        }
    }

    private handleResponse(response: any) {
        if (response.status === "success") {
            this.outputChannel.appendLine(`✓ ${response.message || "Success"}`);
        } else if (response.status === "error") {
            this.outputChannel.appendLine(
                `✗ ERROR: ${response.message || "Unknown error"}`,
            );
            vscode.window.showErrorMessage(`Lila: ${response.message}`);
        } else if (response.result) {
            this.outputChannel.appendLine(
                `Result: ${JSON.stringify(response.result, null, 2)}`,
            );
        } else {
            this.outputChannel.appendLine(
                `Response: ${JSON.stringify(response, null, 2)}`,
            );
        }
    }

    private updateStatusBar() {
        const clientState = this.client.getState();
        const serverState = this.server.getState();

        let icon = "$(circle-slash)";
        let tooltip = "Lila: Disconnected";

        if (clientState === "connected") {
            icon = "$(check)";
            tooltip = "Lila: Connected";
        } else if (serverState === "running") {
            icon = "$(circle-large)";
            tooltip = "Lila: Server Running";
        }

        this.statusBarItem.text = `${icon} Lila`;
        this.statusBarItem.tooltip = tooltip;
    }

    async startServer(): Promise<boolean> {
        const success = await this.server.start();
        if (
            success &&
            vscode.workspace.getConfiguration("lila").get("autoConnect", true)
        ) {
            setTimeout(() => this.connectClient(), 500);
        }
        this.updateStatusBar();
        return success;
    }

    async stopServer(): Promise<void> {
        await this.client.disconnect();
        await this.server.stop();
        this.updateStatusBar();
    }

    async restartServer(): Promise<boolean> {
        await this.client.disconnect();
        await this.server.stop();
        return this.startServer();
    }

    async connectClient(): Promise<boolean> {
        const success = await this.client.connect();
        this.updateStatusBar();
        return success;
    }

    disconnectClient(): void {
        this.client.disconnect();
        this.updateStatusBar();
    }

    async sendCode(
        code: string,
        options: { logInput?: boolean } = {},
    ): Promise<void> {
        if (!this.client.isConnected()) {
            const shouldConnect = await vscode.window.showWarningMessage(
                "Not connected to Lila server. Connect now?",
                "Connect",
                "Cancel",
            );

            if (shouldConnect === "Connect") {
                const connected = await this.connectClient();
                if (!connected) {
                    vscode.window.showErrorMessage("Failed to connect to Lila server");
                    return;
                }
            } else {
                return;
            }
        }

        if (options.logInput !== false) {
            this.outputChannel.appendLine(`>>> ${code}`);
        }

        this.client.send(code);
    }

    evalLine(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const line = editor.document.lineAt(editor.selection.active.line);
        this.sendCode(line.text);
    }

    evalSelection(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage("No text selected");
            return;
        }

        const text = editor.document.getText(selection);
        this.sendCode(text);
    }

    evalBuffer(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const text = editor.document.getText();
        this.sendCode(text);
    }

    evalNode(): void {
        // In VS Code, we can use the built-in syntax awareness
        // or language server protocol to get semantic nodes
        // For now, we'll use the current function or method
        this.evalSmartSelection();
    }

    private evalSmartSelection(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        // Use VS Code's built-in "Expand Selection" to get meaningful blocks
        vscode.commands
            .executeCommand("editor.action.smartSelect.expand")
            .then(() => {
                const selection = editor.selection;
                const text = editor.document.getText(selection);

                if (text.trim().length > 0) {
                    this.sendCode(text);
                } else {
                    vscode.window.showWarningMessage("No code block found");
                }

                // Collapse selection back
                editor.selection = new vscode.Selection(
                    selection.start,
                    selection.start,
                );
            });
    }

    showOutput(): void {
        this.outputChannel.show();
    }

    hideOutput(): void {
        // Output channels don't have a hide method in VS Code
        // Users can manually hide them
    }

    clearOutput(): void {
        this.outputChannel.clear();
    }

    showStatus(): void {
        const clientState = this.client.getState();
        const serverState = this.server.getState();

        vscode.window.showInformationMessage(
            `Lila Status:\n` +
            `Server: ${serverState}\n` +
            `Client: ${clientState}\n` +
            `Connected: ${this.client.isConnected()}`,
        );
    }

    dispose(): void {
        this.client.disconnect();
        this.server.stop();
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
    }
}

export function activate(context: vscode.ExtensionContext): LilaSession {
    const session = new LilaSession(context);

    // Register commands
    const commands = [
        vscode.commands.registerCommand("lila.startServer", () =>
            session.startServer(),
        ),
        vscode.commands.registerCommand("lila.stopServer", () =>
            session.stopServer(),
        ),
        vscode.commands.registerCommand("lila.restartServer", () =>
            session.restartServer(),
        ),
        vscode.commands.registerCommand("lila.connect", () =>
            session.connectClient(),
        ),
        vscode.commands.registerCommand("lila.disconnect", () =>
            session.disconnectClient(),
        ),
        vscode.commands.registerCommand("lila.evalLine", () => session.evalLine()),
        vscode.commands.registerCommand("lila.evalSelection", () =>
            session.evalSelection(),
        ),
        vscode.commands.registerCommand("lila.evalBuffer", () =>
            session.evalBuffer(),
        ),
        vscode.commands.registerCommand("lila.evalNode", () => session.evalNode()),
        vscode.commands.registerCommand("lila.showOutput", () =>
            session.showOutput(),
        ),
        vscode.commands.registerCommand("lila.hideOutput", () =>
            session.hideOutput(),
        ),
        vscode.commands.registerCommand("lila.clearOutput", () =>
            session.clearOutput(),
        ),
        vscode.commands.registerCommand("lila.showStatus", () =>
            session.showStatus(),
        ),
    ];

    commands.forEach((cmd) => context.subscriptions.push(cmd));
    context.subscriptions.push(session);

    return session;
}

export function deactivate(): void {
    // Cleanup is handled by session disposal
}

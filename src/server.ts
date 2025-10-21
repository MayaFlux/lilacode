import * as child_process from "child_process";
import * as vscode from "vscode";

interface LilaServerOptions {
    serverPath: string;
    onOutput?: (data: string) => void;
}

export class LilaServer {
    private process: child_process.ChildProcess | null = null;
    private state: string = "stopped";
    private terminal: vscode.Terminal | null = null;

    constructor(private options: LilaServerOptions) { }

    async start(): Promise<boolean> {
        if (this.process) {
            return true;
        }

        return new Promise((resolve) => {
            try {
                this.setState("starting");

                // Use VS Code terminal for server output
                this.terminal = vscode.window.createTerminal({
                    name: "Lila Server",
                    shellPath: this.options.serverPath,
                });

                this.terminal.show();
                this.setState("running");
                resolve(true);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start Lila server: ${error}`);
                this.setState("error");
                resolve(false);
            }
        });
    }

    async stop(): Promise<void> {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }

        if (this.process) {
            this.process.kill();
            this.process = null;
        }

        this.setState("stopped");
    }

    getState(): string {
        return this.state;
    }

    isRunning(): boolean {
        return this.state === "running";
    }

    showTerminal(): void {
        if (this.terminal) {
            this.terminal.show();
        }
    }

    private setState(state: string): void {
        this.state = state;
    }
}

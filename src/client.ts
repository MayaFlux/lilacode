import * as net from "net";

interface LilaClientOptions {
    host: string;
    port: number;
    onResponse?: (response: any) => void;
    onStateChange?: (state: string) => void;
}

export class LilaClient {
    private socket: net.Socket | null = null;
    private state: string = "disconnected";
    private sessionId: string;
    private messageQueue: string[] = [];

    constructor(private options: LilaClientOptions) {
        this.sessionId = Date.now().toString();
    }

    async connect(): Promise<boolean> {
        if (this.socket && !this.socket.destroyed) {
            return true;
        }

        return new Promise((resolve) => {
            this.setState("connecting");

            this.socket = net.createConnection(
                {
                    host: this.options.host,
                    port: this.options.port,
                },
                () => {
                    this.setState("connected");
                    this.setupSession();
                    this.flushQueue();
                    resolve(true);
                },
            );

            this.socket.on("data", (data) => {
                this.handleData(data.toString());
            });

            this.socket.on("error", (err) => {
                this.setState("error");
                console.error("Lila connection error:", err);
                resolve(false);
            });

            this.socket.on("close", () => {
                this.setState("disconnected");
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.state === "connecting") {
                    this.socket?.destroy();
                    this.setState("error");
                    resolve(false);
                }
            }, 5000);
        });
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        this.setState("disconnected");
    }

    send(code: string): void {
        if (!this.socket || this.socket.destroyed) {
            this.messageQueue.push(code);
            return;
        }

        this.socket.write(code + "\n");
    }

    isConnected(): boolean {
        return (
            this.state === "connected" &&
            this.socket !== null &&
            !this.socket.destroyed
        );
    }

    getState(): string {
        return this.state;
    }

    private setState(state: string): void {
        this.state = state;
        if (this.options.onStateChange) {
            this.options.onStateChange(state);
        }
    }

    private handleData(data: string): void {
        if (!data || data.trim() === "") {
            return;
        }

        try {
            const response = JSON.parse(data);
            if (this.options.onResponse) {
                this.options.onResponse(response);
            }
        } catch (e) {
            // Raw text response
            if (this.options.onResponse) {
                this.options.onResponse({ status: "raw", data: data });
            }
        }
    }

    private setupSession(): void {
        if (this.socket && !this.socket.destroyed) {
            this.socket.write(`@session ${this.sessionId}\n`);
        }
    }

    private flushQueue(): void {
        while (this.messageQueue.length > 0) {
            const code = this.messageQueue.shift();
            if (code) {
                this.send(code);
            }
        }
    }
}

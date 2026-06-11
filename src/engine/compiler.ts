import type { CompileResponse } from "./worker";

export interface CompileResult {
  ok: boolean;
  stl?: ArrayBuffer;
  error?: string;
  logs: string[];
  timeMs: number;
}

const TIMEOUT_MS = 240_000;

/**
 * Latest-wins compile queue around the OpenSCAD worker: at most one compile
 * runs at a time and only the most recent request is kept pending.
 */
class CompilerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private inflightId: number | null = null;
  private pendingCode: string | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  onStart: () => void = () => {};
  onResult: (r: CompileResult) => void = () => {};

  compile(code: string): void {
    if (this.inflightId !== null) {
      this.pendingCode = code;
      return;
    }
    this.start(code);
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<CompileResponse>) => this.handleMessage(e.data);
      this.worker.onerror = (e) => {
        this.finish({
          ok: false,
          error: `Worker error: ${e.message || "unknown"}`,
          logs: [],
          timeMs: 0,
        });
      };
    }
    return this.worker;
  }

  private start(code: string): void {
    const id = this.nextId++;
    this.inflightId = id;
    this.onStart();
    this.ensureWorker().postMessage({ id, code });
    this.timeout = setTimeout(() => {
      this.worker?.terminate();
      this.worker = null;
      this.finish({
        ok: false,
        error: `Compile timed out after ${TIMEOUT_MS / 1000}s`,
        logs: [],
        timeMs: TIMEOUT_MS,
      });
    }, TIMEOUT_MS);
  }

  private handleMessage(msg: CompileResponse): void {
    if (msg.id !== this.inflightId) return;
    this.finish(msg);
  }

  private finish(result: CompileResult): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
    this.inflightId = null;
    const pending = this.pendingCode;
    this.pendingCode = null;
    // Stale results are still delivered (they render fine), but a pending
    // newer compile starts immediately afterwards.
    this.onResult(result);
    if (pending !== null) this.start(pending);
  }
}

export const compiler = new CompilerClient();

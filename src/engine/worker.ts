/// <reference lib="webworker" />
/**
 * Compile worker: runs the OpenSCAD WASM build to turn .scad source into STL.
 * A fresh OpenSCAD instance is created per compile — the WASM module is not
 * reusable after callMain() and instances are cheap once the module is cached.
 */

interface CompileRequest {
  id: number;
  code: string;
}

export interface CompileResponse {
  id: number;
  ok: boolean;
  stl?: ArrayBuffer;
  error?: string;
  logs: string[];
  timeMs: number;
}

type EmscriptenModule = {
  FS: {
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
  };
  callMain(args: string[]): number;
};

type Factory = (opts: Record<string, unknown>) => Promise<EmscriptenModule>;

let factoryPromise: Promise<Factory> | null = null;

function getFactory(): Promise<Factory> {
  if (!factoryPromise) {
    const url = `${self.location.origin}/openscad/openscad.js`;
    factoryPromise = import(/* @vite-ignore */ url).then((m) => m.default as Factory);
  }
  return factoryPromise;
}

// Remember which CLI argument set works for this engine build. Prefer the
// Manifold geometry backend (huge speedup over CGAL); fall back gracefully
// on engine builds that don't know the flag.
let knownGoodArgs: string[] | null = null;
const ARG_CANDIDATES: string[][] = [
  ["--backend=manifold", "--export-format=binstl", "-o", "/output.stl"],
  ["--enable=manifold", "--export-format=binstl", "-o", "/output.stl"],
  ["--export-format=binstl", "-o", "/output.stl"],
  ["-o", "/output.stl"],
];

async function runOnce(code: string, args: string[], logs: string[]): Promise<Uint8Array | null> {
  const factory = await getFactory();
  const instance = await factory({
    noInitialRun: true,
    print: (s: string) => logs.push(s),
    printErr: (s: string) => logs.push(s),
    locateFile: (path: string) => `${self.location.origin}/openscad/${path}`,
  });
  instance.FS.writeFile("/input.scad", code);
  try {
    instance.callMain(["/input.scad", ...args]);
  } catch (err) {
    // Emscripten throws ExitStatus on exit(); only rethrow real failures
    const name = (err as { name?: string })?.name;
    if (name !== "ExitStatus") throw err;
  }
  try {
    const data = instance.FS.readFile("/output.stl");
    return data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

self.onmessage = async (e: MessageEvent<CompileRequest>) => {
  const { id, code } = e.data;
  const logs: string[] = [];
  const t0 = performance.now();

  const respond = (r: Omit<CompileResponse, "id" | "timeMs" | "logs">) => {
    const msg: CompileResponse = { id, logs, timeMs: performance.now() - t0, ...r };
    if (r.stl) (self as unknown as Worker).postMessage(msg, [r.stl]);
    else (self as unknown as Worker).postMessage(msg);
  };

  try {
    const candidates = knownGoodArgs ? [knownGoodArgs] : ARG_CANDIDATES;
    for (const args of candidates) {
      let data: Uint8Array | null = null;
      try {
        data = await runOnce(code, args, logs);
      } catch (err) {
        logs.push(String(err));
      }
      if (data) {
        knownGoodArgs = args;
        // Copy into a fresh buffer: FS.readFile views into WASM memory
        const buf = data.slice().buffer;
        respond({ ok: true, stl: buf });
        return;
      }
    }
    respond({
      ok: false,
      error: "Compile produced no geometry — check the log for errors.",
    });
  } catch (err) {
    respond({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

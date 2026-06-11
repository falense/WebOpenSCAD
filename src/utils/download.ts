export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, "_") || "model";
}

/** Triangle count for a binary STL buffer, or null for ASCII/unknown. */
export function stlTriangleCount(stl: ArrayBuffer): number | null {
  if (stl.byteLength < 84) return null;
  const head = new TextDecoder().decode(stl.slice(0, 5));
  if (head === "solid") {
    // Could still be binary with a "solid" header; verify via length math
    const n = new DataView(stl).getUint32(80, true);
    if (84 + n * 50 === stl.byteLength) return n;
    return null;
  }
  return new DataView(stl).getUint32(80, true);
}

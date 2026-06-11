import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Subpath deploys (e.g. GitHub Pages): BASE_PATH=/WebOpenSCAD/ npm run build
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    watch: {
      // Reliable file watching inside Docker bind mounts
      usePolling: true,
      interval: 300,
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});

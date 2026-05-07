import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = process.env.TAURI_DEV_HOST;
const isDebug = Boolean(process.env.TAURI_ENV_DEBUG);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@adc-ui": resolve(__dirname, "./design-system/adc-ui"),
      "@schema": resolve(__dirname, "./schema"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/test-cases-reference/**",
        "**/.qastor-runs/**",
      ],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2022",
    minify: isDebug ? false : "esbuild",
    sourcemap: isDebug,
  },
});

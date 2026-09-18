import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: mode === "e2e"
        ? {
            app: resolve(projectRoot, "index.html"),
            hostHarness: resolve(projectRoot, "examples/host-harness.html"),
          }
        : resolve(projectRoot, "index.html"),
    },
  },
}));

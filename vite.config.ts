import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so dist/ works from any static host or subpath.
  base: "./",
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});

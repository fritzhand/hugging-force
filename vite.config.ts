/* Hugging Force: a static Vite app (React 19 for the page, three.js for the universe).
   The catalog is bundled from src/data/catalog.json; no environment variable reaches the browser. */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Nothing from the environment is exposed to the bundle.
  envPrefix: "HUGGING_FORCE_CLIENT_ENV_DISABLED_",
  server: { port: 5190 },
  preview: { port: 4190 },
  build: {
    target: "es2022",
    // three.js is one module of about 700 kB (minified); it loads after the page text.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "three", test: /node_modules[\\/]three[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});

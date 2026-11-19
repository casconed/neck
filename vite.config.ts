import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  base: "/neck/", // GitHub Pages subpath; must match the repo name
  test: { include: ["src/**/*.test.ts"] },
});

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import pkg from "./package.json";

export default defineConfig({
  base: "/navigator/",
  plugins: [react(), tailwindcss()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  test: {
    // Playwright specs live under e2e/**/*.spec.ts; vitest's default include
    // pattern also matches *.spec.ts, so exclude the whole directory to keep
    // the two runners from colliding. .claude/ holds git worktrees of this
    // repo, with tests of their own.
    exclude: ["**/node_modules/**", "**/.git/**", "e2e/**", ".claude/**"],
  },
});

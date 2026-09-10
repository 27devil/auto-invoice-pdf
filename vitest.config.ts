import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Deliberately separate from vite.config.ts: that config loads the
// @react-router/dev Vite plugin, which expects the full framework-mode app
// directory conventions and isn't needed (or safe) to load just to run
// unit tests against server/ and tests/.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});

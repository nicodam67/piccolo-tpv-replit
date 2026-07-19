import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/qr-menu/";

// When VITE_CONVEX_URL is absent, alias Convex/auth packages to local
// demo mocks so the app renders with seed data — no cloud credentials needed.
const isDemoMode = !process.env.VITE_CONVEX_URL;

const demoAliases = isDemoMode
  ? {
      "convex/react": path.resolve(import.meta.dirname, "src/lib/demo-convex.tsx"),
      "@convex-dev/auth/react": path.resolve(
        import.meta.dirname,
        "src/lib/demo-convex-auth.tsx",
      ),
    }
  : {};

if (isDemoMode) {
  console.log("[qr-menu] DEMO MODE — serving seed data (no VITE_CONVEX_URL)");
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [runtimeErrorOverlay()]
      : []),
  ],
  resolve: {
    alias: {
      ...demoAliases,
      "@/convex": path.resolve(import.meta.dirname, "./convex"),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: {
      overlay: false,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

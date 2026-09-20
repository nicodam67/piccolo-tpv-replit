import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { resolveQrRuntimeMode } from "./src/lib/qr-runtime-mode";

const rawPort = process.env.PORT ?? "5174";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/qr-menu/";

// When VITE_CONVEX_URL is absent, alias Convex/auth packages to local
// demo mocks so the app renders with seed data — no cloud credentials needed.
if (process.env.NODE_ENV && !["production", "development", "test"].includes(process.env.NODE_ENV)) {
  throw new Error(`Unsupported NODE_ENV: ${process.env.NODE_ENV}`);
}
const runtimeMode = resolveQrRuntimeMode({
  nodeEnv: process.env.NODE_ENV,
  convexUrl: process.env.VITE_CONVEX_URL,
  demoFlag: process.env.QR_MENU_DEMO,
});
if (process.env.NODE_ENV === "production" && runtimeMode !== "live") {
  throw new Error("QR Menu production build requires VITE_CONVEX_URL");
}
const isDemoMode = runtimeMode === "demo";

const demoAliases = isDemoMode
  ? {
      "convex/react": path.resolve(import.meta.dirname, "src/lib/demo-convex.tsx"),
      "@convex-dev/auth/react": path.resolve(
        import.meta.dirname,
        "src/lib/demo-convex-auth.tsx",
      ),
    }
  : {};

if (isDemoMode) console.log("[qr-menu] explicit development DEMO MODE");

/**
 * Vite plugin: redirect any request that doesn't start with the base path
 * to the base path. This prevents the Vite "did you mean to visit /qr-menu/?"
 * hint page from showing when the Replit proxy routes "/" here.
 */
function baseRedirectPlugin(base: string): Plugin {
  return {
    name: "base-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "/";
        // Let Vite internals (@vite, __vite, node_modules) pass through
        if (url.startsWith("/@") || url.startsWith("/__")) {
          return next();
        }
        // If the request is already inside the base path, let it through
        if (url.startsWith(base) || url === base.replace(/\/$/, "")) {
          return next();
        }
        // Otherwise redirect to the base
        res.writeHead(302, { Location: base });
        res.end();
      });
    },
  };
}

export default defineConfig({
  define: { __QR_RUNTIME_MODE__: JSON.stringify(runtimeMode) },
  base: basePath,
  plugins: [
    baseRedirectPlugin(basePath),
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

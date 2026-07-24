import { defineConfig } from "orval";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const output = path.resolve(root, "lib/api-client-react/src/phase1-generated");

export default defineConfig({
  floorPhase1: {
    input: {
      target: path.resolve(import.meta.dirname, "openapi.yaml"),
      filters: {
        mode: "include",
        tags: ["phase1-floor"],
      },
    },
    output: {
      workspace: output,
      target: ".",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: path.resolve(root, "lib/api-client-react/src/custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
});

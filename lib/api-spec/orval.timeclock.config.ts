import { defineConfig } from "orval";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  timeclockContract: {
    input: {
      target: path.resolve(import.meta.dirname, "openapi.yaml"),
      filters: { mode: "include", tags: ["phase56-timeclock"] },
    },
    output: {
      workspace: path.resolve(root, "lib/api-client-react/src/timeclock-generated"),
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

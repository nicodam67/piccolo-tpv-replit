import { defineConfig } from "orval";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

const titleTransformer = (config) => {
  config.info = config.info ?? {};
  config.info.title = "Api";
  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: path.resolve(__dirname, "openapi.yaml"),
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: path.resolve(__dirname, "openapi.yaml"),
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      indexFiles: false,
      override: {
        zod: {
          coerce: {
            query: ["boolean", "number", "string"],
            param: ["boolean", "number", "string"],
            body: ["bigint", "date"],
            response: ["bigint", "date"],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
  },
});

export type QrRuntimeMode = "live" | "demo" | "blocked";

export function resolveQrRuntimeMode(input: {
  nodeEnv?: string;
  convexUrl?: string;
  demoFlag?: string;
}): QrRuntimeMode {
  if (input.convexUrl) return "live";
  if (input.nodeEnv !== "production" && input.demoFlag === "true") return "demo";
  return "blocked";
}

export type QrRuntimeMode = "live" | "demo" | "blocked";

export function resolveQrRuntimeMode(input: {
  nodeEnv?: string;
  convexUrl?: string;
  demoFlag?: string;
}): QrRuntimeMode {
  const production = input.nodeEnv === "production";
  if (input.convexUrl) return "live";
  if (!production && input.demoFlag === "true") return "demo";
  return "blocked";
}

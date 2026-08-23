export const RC_VERSION: string;
export const NODE_VERSION: string;
export const CADDY_VERSION: string;
export function hashFile(filePath: string, algorithm?: string): string;
export function sha256File(filePath: string): string;
export function artifactManifest(outputDirectory: string, gitCommit: string): {
  product: string;
  version: string;
  signed: boolean;
  productionCertified: boolean;
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  [key: string]: unknown;
};
export function writeChecksums(
  outputDirectory: string,
  manifest: ReturnType<typeof artifactManifest>,
): void;

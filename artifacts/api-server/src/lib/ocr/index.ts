/**
 * OCR provider factory.
 * Set OCR_PROVIDER env var to "azure" | "google" | "aws" to swap providers.
 * Defaults to the simulator for development/demo.
 */
import { OcrSimulator } from "./simulator";
import type { OcrProvider } from "./types";

export * from "./types";

let _instance: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (_instance) return _instance;

  const provider = process.env.OCR_PROVIDER ?? "simulator";
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Conector OCR real no configurado (${provider})`);
  }

  switch (provider) {
    case "simulator":
    default:
      _instance = new OcrSimulator();
      break;
    // Future providers:
    // case "azure":
    //   _instance = new AzureDocumentIntelligenceProvider(process.env.AZURE_OCR_KEY!, process.env.AZURE_OCR_ENDPOINT!);
    //   break;
  }

  return _instance;
}

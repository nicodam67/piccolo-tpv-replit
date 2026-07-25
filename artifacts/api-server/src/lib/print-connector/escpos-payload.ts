import iconv from "iconv-lite";
import type { PrintCodePage } from "./types";

const CODE_PAGE_COMMAND: Record<PrintCodePage, number> = {
  cp437: 0,
  windows1252: 16,
  cp858: 19,
};

export const MAX_ESC_POS_PAYLOAD_BYTES = 512 * 1024;

export function buildEscPosPayload(options: {
  content: string;
  copies?: number;
  codePage?: PrintCodePage;
  cut?: boolean;
  openDrawer?: boolean;
}): Buffer {
  const {
    content,
    copies = 1,
    codePage = "cp858",
    cut = true,
    openDrawer = false,
  } = options;
  if (!Number.isInteger(copies) || copies < 1 || copies > 5) {
    throw new Error("PRINT_COPIES_INVALID");
  }

  const init = Buffer.from([0x1b, 0x40]);
  const selectCodePage = Buffer.from([0x1b, 0x74, CODE_PAGE_COMMAND[codePage]]);
  const text = iconv.encode(content, codePage);
  const feed = Buffer.from([0x0a, 0x0a, 0x0a]);
  const drawer = openDrawer ? Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]) : Buffer.alloc(0);
  const cutCommand = cut ? Buffer.from([0x1d, 0x56, 0x01]) : Buffer.alloc(0);
  const oneCopy = Buffer.concat([init, selectCodePage, text, feed, drawer, cutCommand]);
  const payload = Buffer.concat(Array.from({ length: copies }, () => oneCopy));

  if (payload.byteLength > MAX_ESC_POS_PAYLOAD_BYTES) {
    throw new Error("PRINT_PAYLOAD_TOO_LARGE");
  }
  return payload;
}

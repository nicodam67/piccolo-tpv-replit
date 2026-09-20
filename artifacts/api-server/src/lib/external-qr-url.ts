export function getExternalQrMenuUrl(value = process.env["PICCOLO_QR_MENU_URL"]): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const APP_VERSION = process.env["PICCOLO_VERSION"] ?? "0.9.0-rc.1";
export const RELEASE_CHANNEL = APP_VERSION.includes("-rc.") ? "release-candidate" : "stable";

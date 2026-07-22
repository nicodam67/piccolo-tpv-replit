import { getIO, type SocketFunction } from "./socket";

const RESTAURANT_ID = (process.env["RESTAURANT_ID"] ?? "default")
  .replace(/[^a-zA-Z0-9_-]/g, "_");

function roomForFunction(functionName: SocketFunction): string {
  return `restaurant:${RESTAURANT_ID}:function:${functionName}`;
}

function roomForEmployee(employeeId: string): string {
  return `restaurant:${RESTAURANT_ID}:employee:${employeeId}`;
}

function scopedEmit(room: string, event: string, payload?: unknown): void {
  const server = getIO();
  // Test doubles created before room isolation only expose emit(). Production
  // always uses Socket.IO's room target.
  const target = typeof server.to === "function" ? server.to(room) : server;
  if (payload === undefined) target.emit(event);
  else target.emit(event, payload);
}

export function emitToFunction(
  functionName: SocketFunction,
  event: string,
  payload?: unknown,
): void {
  scopedEmit(roomForFunction(functionName), event, payload);
}

export function emitToEmployee(employeeId: string, event: string, payload?: unknown): void {
  scopedEmit(roomForEmployee(employeeId), event, payload);
}

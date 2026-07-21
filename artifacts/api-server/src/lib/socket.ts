import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import {
  authenticateSessionToken,
  type AuthenticatedUser,
} from "../middlewares/auth";

let io: SocketIOServer | null = null;
const RESTAURANT_ID = (process.env["RESTAURANT_ID"] ?? "default")
  .replace(/[^a-zA-Z0-9_-]/g, "_");

export type SocketFunction = "floor" | "kds" | "cash" | "inventory" | "admin";

const ROLE_FUNCTIONS: Record<string, SocketFunction[]> = {
  admin: ["floor", "kds", "cash", "inventory", "admin"],
  manager: ["floor", "kds", "cash", "inventory", "admin"],
  encargado: ["floor", "kds", "cash", "inventory"],
  waiter: ["floor"],
  cashier: ["cash"],
  kitchen: ["kds"],
};

export function restaurantRoom(): string {
  return `restaurant:${RESTAURANT_ID}`;
}

export function functionRoom(functionName: SocketFunction): string {
  return `${restaurantRoom()}:function:${functionName}`;
}

export function employeeRoom(employeeId: string): string {
  return `${restaurantRoom()}:employee:${employeeId}`;
}

function socketCorsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) {
  if (!origin) return callback(null, true);
  const allowed = new Set([
    "https://piccolo-tpv.replit.app",
    ...(process.env["REPLIT_DEV_DOMAIN"]
      ? [`https://${process.env["REPLIT_DEV_DOMAIN"]}`]
      : []),
    ...(process.env["ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  return allowed.has(origin)
    ? callback(null, true)
    : callback(new Error("origin not allowed"));
}

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: socketCorsOrigin },
    path: "/api/socket.io",
    // Keep connections alive across long idle periods (e.g. tablets left on overnight).
    // pingInterval: how often the server pings the client (ms).
    // pingTimeout: how long to wait for a pong before declaring the connection dead (ms).
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  io.use(async (socket, next) => {
    const authToken = typeof socket.handshake.auth?.token === "string"
      ? socket.handshake.auth.token
      : "";
    const authorization = socket.handshake.headers.authorization;
    const headerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const token = authToken || headerToken;
    if (!token) return next(new Error("unauthorized"));

    try {
      const user = await authenticateSessionToken(token);
      const functions = ROLE_FUNCTIONS[user.role];
      if (!functions) return next(new Error("forbidden"));
      socket.data.user = user;
      socket.data.restaurantId = RESTAURANT_ID;
      socket.data.functions = functions;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as AuthenticatedUser;
    socket.join(restaurantRoom());
    socket.join(employeeRoom(user.id));
    for (const functionName of socket.data.functions as SocketFunction[]) {
      socket.join(functionRoom(functionName));
    }

    // Application-level heartbeat: the client sends "ping" every ~60 s and
    // expects a "pong" back. If no pong arrives the client force-reconnects.
    socket.on("ping", () => {
      socket.emit("pong");
    });

    socket.onAny((event) => {
      if (event !== "ping") {
        socket.emit("socket:error", { error: "Evento no autorizado" });
      }
    });

    socket.on("disconnect", () => {});
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
}

export function emitToFunction(
  functionName: SocketFunction,
  event: string,
  payload?: unknown,
): void {
  const target = getIO().to(functionRoom(functionName));
  if (payload === undefined) target.emit(event);
  else target.emit(event, payload);
}

export function emitToEmployee(employeeId: string, event: string, payload?: unknown): void {
  const target = getIO().to(employeeRoom(employeeId));
  if (payload === undefined) target.emit(event);
  else target.emit(event, payload);
}

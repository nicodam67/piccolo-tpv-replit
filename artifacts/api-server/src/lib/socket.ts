import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";

let io: SocketIOServer | null = null;

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: "*" },
    path: "/api/socket.io",
    // Keep connections alive across long idle periods (e.g. tablets left on overnight).
    // pingInterval: how often the server pings the client (ms).
    // pingTimeout: how long to wait for a pong before declaring the connection dead (ms).
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  io.on("connection", (socket) => {
    // Application-level heartbeat: the client sends "ping" every ~60 s and
    // expects a "pong" back. If no pong arrives the client force-reconnects.
    socket.on("ping", () => {
      socket.emit("pong");
    });

    socket.on("disconnect", () => {});
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error("Socket.io not initialised");
  return io;
}

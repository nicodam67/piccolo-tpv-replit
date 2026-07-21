import { io, type Socket } from "socket.io-client";

export function connectAuthenticatedSocket(): Socket {
  return io({
    path: "/api/socket.io",
    withCredentials: true,
    reconnection: true,
    reconnectionDelayMax: 30_000,
  });
}

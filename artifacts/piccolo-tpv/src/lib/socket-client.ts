import { io, type Socket } from "socket.io-client";

export function connectAuthenticatedSocket(): Socket {
  return io({
    path: "/api/socket.io",
    auth: (callback) => {
      callback({ token: localStorage.getItem("token") ?? "" });
    },
    reconnection: true,
    reconnectionDelayMax: 30_000,
  });
}

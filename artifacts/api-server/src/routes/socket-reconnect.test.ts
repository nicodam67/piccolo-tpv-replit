import { createServer, type Server as HttpServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";

const mockAuthenticate = vi.hoisted(() => vi.fn(async (token: string) => {
  if (token === "expired" || token === "revoked") throw new Error("unauthorized");
  if (token === "wrong-role") {
    return { id: "external-1", name: "External", role: "external", jti: "jti-external" };
  }
  if (token === "kds-token") {
    return { id: "kitchen-1", name: "Kitchen", role: "kitchen", jti: "jti-kds" };
  }
  return { id: "waiter-1", name: "Waiter", role: "waiter", jti: "jti-floor" };
}));

vi.mock("../middlewares/auth", () => ({
  authenticateSessionToken: mockAuthenticate,
}));

const {
  employeeRoom,
  functionRoom,
  getIO,
  initSocket,
  restaurantRoom,
} = await import("../lib/socket");
const { emitToFunction } = await import("../lib/socket-events");

function waitForEvent(socket: Socket, event: string, timeoutMs = 2_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function expectNoEvent(socket: Socket, event: string, timeoutMs = 250): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, timeoutMs);
    socket.once(event, () => {
      clearTimeout(timeout);
      reject(new Error(`Unexpected ${event}`));
    });
  });
}

async function connectAndWait(
  url: string,
  token = "floor-token",
  extraAuth: Record<string, unknown> = {},
): Promise<Socket> {
  const client = ioClient(url, {
    path: "/api/socket.io",
    auth: { token, ...extraAuth },
    reconnection: true,
    reconnectionDelay: 20,
    forceNew: true,
    autoConnect: false,
  });
  const connected = waitForEvent(client, "connect");
  client.connect();
  await connected;
  return client;
}

describe("Socket.IO authenticated restaurant/function rooms", () => {
  let httpServer: HttpServer;
  let serverUrl: string;

  beforeAll(async () => {
    process.env["RESTAURANT_ID"] = "test-restaurant";
    httpServer = createServer();
    initSocket(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const address = httpServer.address() as { port: number };
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    getIO().close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("rejects an anonymous handshake", async () => {
    const client = ioClient(serverUrl, {
      path: "/api/socket.io",
      autoConnect: false,
      forceNew: true,
    });
    const rejected = waitForEvent(client, "connect_error");
    client.connect();
    await expect(rejected).resolves.toBeUndefined();
    expect(client.connected).toBe(false);
    client.close();
  });

  it.each(["expired", "revoked"])("rejects a %s session", async (token) => {
    const client = ioClient(serverUrl, {
      path: "/api/socket.io",
      auth: { token },
      autoConnect: false,
      forceNew: true,
    });
    const rejected = waitForEvent(client, "connect_error");
    client.connect();
    await expect(rejected).resolves.toBeUndefined();
    client.close();
  });

  it("rejects a valid session whose role has no socket function", async () => {
    const client = ioClient(serverUrl, {
      path: "/api/socket.io",
      auth: { token: "wrong-role" },
      autoConnect: false,
      forceNew: true,
    });
    const rejected = waitForEvent(client, "connect_error");
    client.connect();
    await expect(rejected).resolves.toBeUndefined();
    client.close();
  });

  it("server assigns restaurant, function and employee rooms", async () => {
    const client = await connectAndWait(serverUrl, "floor-token", {
      restaurantId: "attacker-controlled",
    });
    const serverSocket = [...getIO().sockets.sockets.values()][0];
    expect(serverSocket.rooms).toContain(restaurantRoom());
    expect(serverSocket.rooms).toContain(functionRoom("floor"));
    expect(serverSocket.rooms).toContain(employeeRoom("waiter-1"));
    expect([...serverSocket.rooms].join(" ")).not.toContain("attacker-controlled");
    client.close();
  });

  it("delivers floor events only to the floor room", async () => {
    const floor = await connectAndWait(serverUrl, "floor-token");
    const kitchen = await connectAndWait(serverUrl, "kds-token");
    const received = waitForEvent(floor, "tables:refresh");
    const isolated = expectNoEvent(kitchen, "tables:refresh");

    emitToFunction("floor", "tables:refresh");

    await expect(received).resolves.toBeUndefined();
    await expect(isolated).resolves.toBeUndefined();
    floor.close();
    kitchen.close();
  });

  it("rejoins authorized rooms after reconnect", async () => {
    const floor = await connectAndWait(serverUrl);
    floor.disconnect();
    const reconnected = waitForEvent(floor, "connect");
    floor.connect();
    await reconnected;

    const received = waitForEvent(floor, "tables:refresh");
    emitToFunction("floor", "tables:refresh");
    await expect(received).resolves.toBeUndefined();
    floor.close();
  });

  it("rejects inbound business events", async () => {
    const floor = await connectAndWait(serverUrl);
    const rejected = waitForEvent(floor, "socket:error");
    floor.emit("orders:update", { orderId: "other-restaurant" });
    await expect(rejected).resolves.toBeUndefined();
    floor.close();
  });
});

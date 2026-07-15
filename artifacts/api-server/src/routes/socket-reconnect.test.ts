/**
 * Socket.IO reconnection integration test
 *
 * Proves that a client that disconnects and reconnects still receives
 * `tables:refresh` events emitted by the server afterwards.
 *
 * ─── Manual verification procedure (client floor plan) ────────────────────────
 * To confirm the same guarantee holds for a real browser/tablet:
 *
 *   1. Open the floor plan page (`/tables`) and confirm the socket connects
 *      (DevTools → Network → WS → you should see the /api/socket.io handshake).
 *   2. Simulate a network drop: DevTools → Network → throttle to "Offline"
 *      (or physically disconnect the device from Wi-Fi for ~5 s).
 *   3. While offline, trigger a change on any other terminal that normally emits
 *      `tables:refresh` — e.g. mark a table as cleaned via another tab still online.
 *   4. Restore the network connection (un-throttle / reconnect Wi-Fi).
 *   5. Confirm: the floor plan updates automatically within a few seconds
 *      WITHOUT a manual page reload.
 *
 * Why it works: `socket.on('tables:refresh', handler)` in tables.tsx is
 * registered on the *client* Socket.IO instance, not on a server-side socket.
 * That binding survives reconnects because the client object is reused —
 * only the underlying transport is torn down and rebuilt. After reconnect the
 * server assigns a new socket ID, but the next `io.emit('tables:refresh')`
 * from the server reaches the client because the client is now part of the
 * global broadcast pool again.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createServer, type Server as HttpServer } from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { initSocket, getIO } from "../lib/socket";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a promise that resolves when `socket` emits `event`.
 * IMPORTANT: call this BEFORE performing the action that triggers the event,
 * otherwise the event may fire before the listener is registered.
 */
function waitForEvent(socket: Socket, event: string, timeoutMs = 4000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}" (${timeoutMs} ms)`)),
      timeoutMs,
    );
    socket.once(event, () => { clearTimeout(t); resolve(); });
  });
}

/** Connects a client and waits for the `connect` event. */
async function connectAndWait(url: string, opts?: Parameters<typeof ioClient>[1]): Promise<Socket> {
  const client = ioClient(url, {
    path: "/api/socket.io",
    reconnection: true,
    reconnectionDelay: 50,
    reconnectionDelayMax: 200,
    timeout: 3000,
    forceNew: true,
    autoConnect: false,      // We'll call connect() manually so we can set up listeners first
    ...opts,
  });
  const ready = waitForEvent(client, "connect");
  client.connect();
  await ready;
  return client;
}

/** Disconnects a client and waits for the `disconnect` event. */
async function disconnectAndWait(client: Socket): Promise<void> {
  const gone = waitForEvent(client, "disconnect");
  client.disconnect();
  await gone;
}

/** Reconnects a client and waits for the `connect` event. */
async function reconnectAndWait(client: Socket): Promise<void> {
  const ready = waitForEvent(client, "connect");
  client.connect();
  await ready;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("Socket.IO — tables:refresh re-delivery after reconnect", () => {
  let httpServer: HttpServer;
  let serverUrl: string;

  beforeAll(async () => {
    // Start a real HTTP server wired through the existing initSocket configuration
    // (same path "/api/socket.io", same pingInterval/pingTimeout settings).
    httpServer = createServer();
    initSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve); // port 0 → OS picks a free port
    });

    const addr = httpServer.address() as { port: number };
    serverUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    getIO().close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // ── Test 1: single disconnect / reconnect ─────────────────────────────────

  it("client receives tables:refresh after a single disconnect / reconnect", async () => {
    const client = await connectAndWait(serverUrl);

    try {
      expect(client.connected).toBe(true);

      // Simulate network drop then restore
      await disconnectAndWait(client);
      expect(client.connected).toBe(false);

      await reconnectAndWait(client);
      expect(client.connected).toBe(true);

      // Server emits tables:refresh AFTER the reconnect — client must still receive it
      const received = waitForEvent(client, "tables:refresh");
      getIO().emit("tables:refresh");
      await expect(received).resolves.toBeUndefined();
    } finally {
      client.disconnect();
    }
  });

  // ── Test 2: multiple reconnect cycles ────────────────────────────────────

  it("client receives tables:refresh after three successive disconnect / reconnect cycles", async () => {
    const client = await connectAndWait(serverUrl);

    try {
      for (let i = 0; i < 3; i++) {
        await disconnectAndWait(client);
        await reconnectAndWait(client);
      }

      expect(client.connected).toBe(true);

      const received = waitForEvent(client, "tables:refresh");
      getIO().emit("tables:refresh");
      await expect(received).resolves.toBeUndefined();
    } finally {
      client.disconnect();
    }
  });

  // ── Test 3: stable client unaffected by a peer reconnecting ───────────────
  // Confirms the broadcast reaches ALL connected clients simultaneously.

  it("stable client also receives tables:refresh while a peer is reconnecting", async () => {
    const stable = await connectAndWait(serverUrl, { reconnection: false });
    const peer   = await connectAndWait(serverUrl);

    try {
      // Drop and restore the peer
      await disconnectAndWait(peer);
      await reconnectAndWait(peer);
      expect(peer.connected).toBe(true);
      expect(stable.connected).toBe(true);

      // Both clients must receive the next broadcast
      const stableReceived = waitForEvent(stable, "tables:refresh");
      const peerReceived   = waitForEvent(peer,   "tables:refresh");
      getIO().emit("tables:refresh");

      await expect(stableReceived).resolves.toBeUndefined();
      await expect(peerReceived).resolves.toBeUndefined();
    } finally {
      stable.disconnect();
      peer.disconnect();
    }
  });

  // ── Test 4: event is NOT delivered to a disconnected (offline) client ─────
  // Confirms the test setup is meaningful: events are NOT delivered to
  // clients that have disconnected and not yet reconnected.

  it("does NOT receive tables:refresh while disconnected — only after reconnecting", async () => {
    const client = await connectAndWait(serverUrl);

    try {
      await disconnectAndWait(client);

      // Emit while the client is offline — it should miss this
      getIO().emit("tables:refresh");

      // Now reconnect
      await reconnectAndWait(client);
      expect(client.connected).toBe(true);

      // Emit again after reconnect — this one must arrive
      const receivedAfterReconnect = waitForEvent(client, "tables:refresh");
      getIO().emit("tables:refresh");
      await expect(receivedAfterReconnect).resolves.toBeUndefined();
    } finally {
      client.disconnect();
    }
  });
});

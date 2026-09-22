import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  encodeEscPos,
  getPrinterStatus,
  sendToPrinter,
  type SendToPrinterArgs,
} from "./print-connector-sim";

const originalToken = process.env["PRINT_AGENT_TOKEN"];
const token = "0123456789abcdef0123456789abcdef";

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env["PRINT_AGENT_TOKEN"];
  } else {
    process.env["PRINT_AGENT_TOKEN"] = originalToken;
  }
});

async function testServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
  };
}

function printerArgs(agentUrl: string): SendToPrinterArgs {
  return {
    printerId: "123e4567-e89b-42d3-a456-426614174000",
    printerIp: "",
    printerPort: 0,
    content: "TEST",
    copies: 2,
    connectionType: "windows_agent",
    agentUrl,
    autoCut: false,
    openCashDrawer: false,
    dedupeKey: "print-job-123",
  };
}

describe("Windows print agent HTTP contract", () => {
  it("sends the exact authenticated print request and consumes the exact response", async () => {
    process.env["PRINT_AGENT_TOKEN"] = token;
    const requests: Array<{
      method: string | undefined;
      url: string | undefined;
      authorization: string | undefined;
      idempotencyKey: string | undefined;
      contentType: string | undefined;
      body: unknown;
    }> = [];
    const server = await testServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        requests.push({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          idempotencyKey: request.headers["idempotency-key"] as string | undefined,
          contentType: request.headers["content-type"],
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          accepted: true,
          confirmationLevel: "spooler",
          error: "",
        }));
      });
    });
    try {
      const args = printerArgs(server.url);
      await expect(sendToPrinter(args)).resolves.toEqual({
        ok: true,
        simulated: false,
        confirmationLevel: "spooler",
      });
      expect(requests).toEqual([{
        method: "POST",
        url: "/v1/print",
        authorization: `Bearer ${token}`,
        idempotencyKey: "print-job-123",
        contentType: "application/json",
        body: {
          printerId: args.printerId,
          payloadBase64: encodeEscPos(args).toString("base64"),
          copies: 2,
        },
      }]);
    } finally {
      await server.close();
    }
  });

  it("does not make a request without PRINT_AGENT_TOKEN", async () => {
    delete process.env["PRINT_AGENT_TOKEN"];
    let requests = 0;
    const server = await testServer((_request, response) => {
      requests++;
      response.writeHead(500).end();
    });
    try {
      const result = await sendToPrinter(printerArgs(server.url));
      expect(result).toMatchObject({
        ok: false,
        error: "PRINT_AGENT_TOKEN no configurado",
      });
      expect(requests).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("does not make a request without an idempotency key", async () => {
    process.env["PRINT_AGENT_TOKEN"] = token;
    let requests = 0;
    const server = await testServer((_request, response) => {
      requests++;
      response.writeHead(500).end();
    });
    try {
      const result = await sendToPrinter({ ...printerArgs(server.url), dedupeKey: null });
      expect(result).toMatchObject({
        ok: false,
        error: "Idempotency-Key no disponible",
      });
      expect(requests).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("preserves transport confirmation for a TCP target behind the agent", async () => {
    process.env["PRINT_AGENT_TOKEN"] = token;
    const server = await testServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ accepted: true, confirmationLevel: "transport", error: "" }));
    });
    try {
      await expect(sendToPrinter(printerArgs(server.url))).resolves.toMatchObject({
        ok: true,
        confirmationLevel: "transport",
      });
    } finally {
      await server.close();
    }
  });

  it("rejects an accepted response with an invalid confirmation level", async () => {
    process.env["PRINT_AGENT_TOKEN"] = token;
    const server = await testServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ accepted: true, confirmationLevel: "simulated", error: "" }));
    });
    try {
      await expect(sendToPrinter(printerArgs(server.url))).resolves.toMatchObject({
        ok: false,
        error: "Respuesta inválida del agente: confirmationLevel ausente o desconocido",
      });
    } finally {
      await server.close();
    }
  });

  it("authenticates the health request", async () => {
    process.env["PRINT_AGENT_TOKEN"] = token;
    let authorization: string | undefined;
    const server = await testServer((request, response) => {
      authorization = request.headers.authorization;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        physicalStatusVerified: false,
      }));
    });
    try {
      const result = await getPrinterStatus({
        printerId: "123e4567-e89b-42d3-a456-426614174000",
        printerIp: "",
        printerPort: 0,
        connectionType: "windows_agent",
        agentUrl: server.url,
      });
      expect(authorization).toBe(`Bearer ${token}`);
      expect(result).toMatchObject({ status: "online", confirmationLevel: "agent" });
    } finally {
      await server.close();
    }
  });
});

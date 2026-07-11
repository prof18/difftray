import { isIP } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";

import {
  COMPANION_PROTOCOL_VERSION,
  type EncryptedEnvelope
} from "@difftray/companion-protocol";

import { companionError, type CompanionHandler } from "./api.js";
import type { CompanionEnvelopeVerifier } from "./auth.js";

export type RouteDefinition = {
  readonly handler: CompanionHandler;
  readonly method: string;
  readonly path: string;
  readonly requiresAuth?: boolean;
};

const bodyLimitBytes = 256 * 1024;
const requestWindowMs = 60_000;
const urlLimitBytes = 4096;

type RateBucket = {
  count: number;
  resetAt: number;
};

export function createCompanionRouter(
  routes: readonly RouteDefinition[],
  envelopeVerifier: CompanionEnvelopeVerifier
) {
  const buckets = new Map<string, RateBucket>();
  const allowedHosts = new Set(["localhost", os.hostname().toLowerCase()]);
  allowedHosts.add(`${os.hostname().toLowerCase()}.local`);

  return async function route(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    try {
      if (!isAllowedHost(request.headers.host, allowedHosts)) {
        writeJson(response, 403, companionError("forbidden", "Host is not allowed"));
        return;
      }

      if ((request.url?.length ?? 0) > urlLimitBytes) {
        writeJson(response, 414, companionError("bad_request", "URL is too long"));
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (!consumeRateLimit(buckets, request, url.pathname)) {
        writeJson(response, 429, companionError("bad_request", "Rate limit exceeded"));
        return;
      }

      const routeMatches = matchRoutes(routes, request.method ?? "GET", url.pathname);

      if (routeMatches.length === 0) {
        writeJson(response, 404, companionError("not_found", "Route not found"));
        return;
      }

      if (!routeMatches.some((routeMatch) => routeMatch.methodAllowed)) {
        writeJson(response, 401, companionError("unauthorized", "Unauthorized"));
        return;
      }

      const body = await readRequestBody(request);

      if (!body.ok) {
        writeJson(response, body.status, companionError("bad_request", body.error));
        return;
      }

      const authMatches = routeMatches.filter(
        (routeMatch) => routeMatch.route.requiresAuth && routeMatch.methodAllowed
      );

      if (authMatches.length > 0) {
        const envelope = readEncryptedEnvelope(body.value);

        if (!envelope.ok) {
          writeJson(response, 401, companionError("unauthorized", "Unauthorized"));
          return;
        }

        for (const routeMatch of authMatches) {
          const verified = envelopeVerifier.verifyRequestEnvelope({
            envelope: envelope.value,
            logicalMethod: routeMatch.route.method,
            path: url.pathname
          });

          if (!verified.ok) {
            if (verified.reason === "clock_skew") {
              writeJson(
                response,
                401,
                companionError(
                  "unauthorized",
                  "Check that the clocks on your phone and computer are correct"
                )
              );
              return;
            }

            continue;
          }

          const result = await Promise.resolve(
            routeMatch.route.handler({
              body: verified.body,
              device: verified.device,
              params: routeMatch.params,
              query: new URLSearchParams()
            })
          ).catch(() => ({
            body: companionError("internal", "Internal server error"),
            status: 500
          }));
          const responseEnvelope = envelopeVerifier.sealResponseEnvelope({
            body: result.body,
            devicePublicKey: verified.device.devicePublicKey,
            requestId: verified.requestId,
            status: result.status
          });

          writeJson(response, result.status, responseEnvelope);
          return;
        }

        writeJson(response, 401, companionError("unauthorized", "Unauthorized"));
        return;
      }

      const routeMatch = routeMatches[0];
      if (!routeMatch) {
        writeJson(response, 404, companionError("not_found", "Route not found"));
        return;
      }

      const result = await routeMatch.route.handler({
        body: body.value,
        device: null,
        params: routeMatch.params,
        query: url.searchParams
      });

      writeJson(response, result.status, result.body);
    } catch {
      writeJson(response, 500, companionError("internal", "Internal server error"));
    }
  };
}

export function isAllowedHost(
  hostHeader: string | undefined,
  allowedHosts = new Set(["localhost", os.hostname().toLowerCase()])
): boolean {
  if (!hostHeader) {
    return false;
  }

  const host = hostWithoutPort(hostHeader).toLowerCase();

  if (allowedHosts.has(host)) {
    return true;
  }

  return isIP(host) !== 0;
}

function consumeRateLimit(
  buckets: Map<string, RateBucket>,
  request: IncomingMessage,
  pathname: string
): boolean {
  const method = request.method ?? "GET";
  const limit = rateLimitFor(method, pathname);
  const key = `${request.socket.remoteAddress ?? "unknown"}:${method}:${pathname}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + requestWindowMs
    });
    return true;
  }

  bucket.count += 1;

  return bucket.count <= limit;
}

function rateLimitFor(method: string, pathname: string): number {
  if (method === "GET" && pathname === "/companion/v1/handshake") {
    return 30;
  }

  if (method === "POST" && pathname === "/companion/v1/pair") {
    return 10;
  }

  if (method === "GET" && /^\/companion\/v1\/pair\/[^/]+$/.test(pathname)) {
    return 40;
  }

  return 60;
}

function hostWithoutPort(hostHeader: string): string {
  if (hostHeader.startsWith("[")) {
    return hostHeader.slice(1, hostHeader.indexOf("]"));
  }

  const colonIndex = hostHeader.lastIndexOf(":");

  if (colonIndex === -1) {
    return hostHeader;
  }

  return hostHeader.slice(0, colonIndex);
}

type RouteMatch = {
  readonly methodAllowed: boolean;
  readonly params: ReadonlyMap<string, string>;
  readonly route: RouteDefinition;
};

function matchRoutes(
  routes: readonly RouteDefinition[],
  method: string,
  pathname: string
): readonly RouteMatch[] {
  const pathParts = pathname.split("/").filter(Boolean);
  const matches: RouteMatch[] = [];

  for (const route of routes) {
    const routeParts = route.path.split("/").filter(Boolean);

    if (routeParts.length !== pathParts.length) {
      continue;
    }

    const params = new Map<string, string>();
    let matched = true;

    for (const [index, routePart] of routeParts.entries()) {
      const pathPart = pathParts[index];

      if (routePart.startsWith(":")) {
        params.set(routePart.slice(1), decodeURIComponent(pathPart ?? ""));
      } else if (routePart !== pathPart) {
        matched = false;
        break;
      }
    }

    if (matched) {
      if (!route.requiresAuth && route.method !== method) {
        continue;
      }

      matches.push({
        methodAllowed: route.requiresAuth ? method === "POST" : route.method === method,
        params,
        route
      });
    }
  }

  return matches;
}

function readEncryptedEnvelope(
  input: unknown
): { readonly ok: true; readonly value: EncryptedEnvelope } | { readonly ok: false } {
  if (typeof input !== "object" || input === null) {
    return { ok: false };
  }

  const envelope = input as Partial<EncryptedEnvelope>;

  if (
    envelope.v !== 1 ||
    typeof envelope.devicePk !== "string" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.box !== "string"
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      box: envelope.box,
      devicePk: envelope.devicePk,
      nonce: envelope.nonce,
      v: 1
    }
  };
}

async function readRequestBody(
  request: IncomingMessage
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly error: string; readonly ok: false; readonly status: number }
> {
  if (request.method === "GET" || request.method === "HEAD") {
    return { ok: true, value: undefined };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    byteLength += buffer.length;

    if (byteLength > bodyLimitBytes) {
      return { error: "Request body is too large", ok: false, status: 413 };
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return { ok: true, value: undefined };
  }

  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { error: "Malformed JSON", ok: false, status: 400 };
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-difftray-protocol", COMPANION_PROTOCOL_VERSION.toString());
  response.end(JSON.stringify(body));
}

import { NextResponse } from "next/server";

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { resolveUserPath } from "@/lib/clawdbot/paths";

export const runtime = "nodejs";

type OpenLocalFilePayload = {
  path?: string;
  line?: number | null;
  column?: number | null;
};

const readRequestPayload = async (request: Request): Promise<OpenLocalFilePayload> => {
  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as OpenLocalFilePayload;
    return body && typeof body === "object" ? body : {};
  }

  const { searchParams } = new URL(request.url);
  return {
    path: searchParams.get("path") ?? undefined,
    line: searchParams.get("line") ? Number.parseInt(searchParams.get("line") ?? "", 10) : null,
    column: searchParams.get("column") ? Number.parseInt(searchParams.get("column") ?? "", 10) : null,
  };
};

const validateOpenPath = (rawPath: string): string => {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new Error("path is required");
  }
  if (trimmed.length > 4096) {
    throw new Error("path too long");
  }
  if (/[\0\r\n]/.test(trimmed)) {
    throw new Error("path contains invalid characters");
  }

  const resolved = resolveUserPath(trimmed);
  if (!path.isAbsolute(resolved)) {
    throw new Error("path must be absolute");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`path does not exist: ${resolved}`);
  }
  return resolved;
};

const openLocalPath = (resolvedPath: string): void => {
  let result: childProcess.SpawnSyncReturns<string>;

  if (process.platform === "win32") {
    result = childProcess.spawnSync("cmd.exe", ["/c", "start", "", resolvedPath], {
      encoding: "utf8",
      windowsHide: true,
    });
  } else if (process.platform === "darwin") {
    result = childProcess.spawnSync("open", [resolvedPath], {
      encoding: "utf8",
    });
  } else {
    result = childProcess.spawnSync("xdg-open", [resolvedPath], {
      encoding: "utf8",
    });
  }

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 0) !== 0) {
    const stderr = (result.stderr ?? "").trim();
    const stdout = (result.stdout ?? "").trim();
    throw new Error(stderr || stdout || "Failed to open local file");
  }
};

const buildHtmlResponse = (resolvedPath: string) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Opening file</title></head><body><p>Opened <code>${resolvedPath}</code>.</p><script>window.close()</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }
  );

const handleOpen = async (request: Request): Promise<Response> => {
  const payload = await readRequestPayload(request);
  const resolvedPath = validateOpenPath(payload.path ?? "");
  openLocalPath(resolvedPath);

  if (request.method === "POST") {
    return NextResponse.json(
      {
        ok: true,
        path: resolvedPath,
        line: payload.line ?? null,
        column: payload.column ?? null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return buildHtmlResponse(resolvedPath);
};

export async function GET(request: Request) {
  try {
    return await handleOpen(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open local file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    return await handleOpen(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open local file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

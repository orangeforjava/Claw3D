// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process"
  );
  return {
    default: actual,
    ...actual,
    spawnSync: vi.fn(),
  };
});

const mockedSpawnSync = vi.mocked(spawnSync);

let GET: typeof import("@/app/api/local-file/open/route")["GET"];
let POST: typeof import("@/app/api/local-file/open/route")["POST"];

beforeAll(async () => {
  ({ GET, POST } = await import("@/app/api/local-file/open/route"));
});

describe("/api/local-file/open route", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    mockedSpawnSync.mockReset();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("opens an existing absolute file path via the local shell", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw3d-open-local-file-"));
    const targetFile = path.join(tempDir, "README.md");
    fs.writeFileSync(targetFile, "# hello", "utf8");

    mockedSpawnSync.mockReturnValue({
      status: 0,
      stdout: "",
      stderr: "",
      error: undefined,
      output: [],
      pid: 1,
      signal: null,
    } as never);

    const response = await POST(
      new Request("http://localhost/api/local-file/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetFile, line: 12 }),
      })
    );

    const body = (await response.json()) as { ok?: boolean; path?: string; line?: number | null };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.path).toBe(targetFile);
    expect(body.line).toBe(12);
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("rejects missing paths before shell execution", async () => {
    const response = await GET(
      new Request("http://localhost/api/local-file/open?path=C%3A%5Cmissing%5Cfile.md")
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/does not exist/i);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });
});

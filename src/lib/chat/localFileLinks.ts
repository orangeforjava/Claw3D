const WINDOWS_DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_DRIVE_PATH_WITH_SLASH_RE = /^\/[A-Za-z]:[\\/]/;

export type LocalFileReference = {
  path: string;
  line: number | null;
  column: number | null;
};

const parseLineAndColumn = (value: string): { path: string; line: number | null; column: number | null } => {
  const hashIndex = value.indexOf("#");
  if (hashIndex >= 0) {
    const base = value.slice(0, hashIndex);
    const hash = value.slice(hashIndex + 1).trim();
    const match = /^L(\d+)(?:C(\d+))?$/i.exec(hash);
    if (!match) {
      return { path: base, line: null, column: null };
    }
    return {
      path: base,
      line: Number.parseInt(match[1] ?? "", 10) || null,
      column: Number.parseInt(match[2] ?? "", 10) || null,
    };
  }

  const match = /^(.*\.[A-Za-z0-9_-]+):(\d+)(?::(\d+))?$/.exec(value);
  if (!match) {
    return { path: value, line: null, column: null };
  }

  return {
    path: match[1] ?? value,
    line: Number.parseInt(match[2] ?? "", 10) || null,
    column: Number.parseInt(match[3] ?? "", 10) || null,
  };
};

const normalizeCandidatePath = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (WINDOWS_DRIVE_PATH_RE.test(trimmed)) return trimmed;
  if (WINDOWS_DRIVE_PATH_WITH_SLASH_RE.test(trimmed)) return trimmed.slice(1);
  if (trimmed.startsWith("~/")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return null;
};

export const parseLocalFileReference = (href: string | null | undefined): LocalFileReference | null => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/api/local-file/open?")) return null;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }

  if (/^https?:\/\//i.test(decoded)) return null;

  if (/^file:\/\//i.test(decoded)) {
    try {
      const parsed = new URL(decoded);
      decoded = parsed.pathname || "";
    } catch {
      return null;
    }
  }

  const parsed = parseLineAndColumn(decoded);
  const normalizedPath = normalizeCandidatePath(parsed.path);
  if (!normalizedPath) return null;

  return {
    path: normalizedPath,
    line: parsed.line,
    column: parsed.column,
  };
};

export const buildLocalFileOpenHref = (reference: LocalFileReference): string => {
  const params = new URLSearchParams({ path: reference.path });
  if (typeof reference.line === "number" && Number.isFinite(reference.line)) {
    params.set("line", String(reference.line));
  }
  if (typeof reference.column === "number" && Number.isFinite(reference.column)) {
    params.set("column", String(reference.column));
  }
  return `/api/local-file/open?${params.toString()}`;
};

export const rewriteMarkdownLocalFileLinks = (text: string): string => {
  if (!text.includes("](")) return text;
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (fullMatch, label: string, rawTarget: string) => {
    const cleanedTarget = rawTarget.trim().replace(/^<|>$/g, "");
    const localFileReference = parseLocalFileReference(cleanedTarget);
    if (!localFileReference) return fullMatch;
    return `[${label}](${buildLocalFileOpenHref(localFileReference)})`;
  });
};

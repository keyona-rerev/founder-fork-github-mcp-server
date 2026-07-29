import { IncomingMessage } from "http";
import * as https from "https";

const GITHUB_API_BASE = "https://api.github.com";
export const CHARACTER_LIMIT = 50000;

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN environment variable is not set");
  return token;
}

export async function githubRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown
): Promise<T> {
  const token = getToken();
  const url = path.startsWith("https://") ? path : `${GITHUB_API_BASE}${path}`;
  const parsedUrl = new URL(url);

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-mcp-server/1.0.0",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: Buffer) => (data += chunk.toString()));
      res.on("end", () => {
        const status = res.statusCode ?? 0;
        if (status === 204 || data === "") {
          resolve({} as T);
          return;
        }
        try {
          const parsed = JSON.parse(data) as T;
          if (status >= 400) {
            const err = parsed as { message?: string };
            reject(new Error(`GitHub API error ${status}: ${err.message ?? data}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Failed to parse GitHub response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

export function truncate(text: string, limit = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[Truncated — ${text.length - limit} chars omitted]`;
}

export function toText(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

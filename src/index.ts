import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response, NextFunction } from "express";
import { registerRepoTools } from "./tools/repos.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerSearchTools } from "./tools/search.js";

const app = express();
app.use(express.json());

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
if (!AUTH_TOKEN) {
  throw new Error("MCP_AUTH_TOKEN environment variable is required — generate one (e.g. `openssl rand -hex 32`) and set it in Railway Variables");
}

// Redact the key from any request logging before it can reach logs/log drains
function redactKeyMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (typeof req.query.key === "string") {
    (req as unknown as { query: Record<string, unknown> }).query.key = "[REDACTED]";
  }
  next();
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const provided = req.query.key;
  if (typeof provided !== "string" || provided !== AUTH_TOKEN) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "github-mcp-server", version: "1.0.0" });
});

// GET /mcp — discovery ping from Claude.ai (also gated — no reason to leave it open)
app.get("/mcp", requireAuth, redactKeyMiddleware, (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", name: "github-mcp-server" });
});

// POST /mcp — MCP protocol handler
app.post("/mcp", requireAuth, redactKeyMiddleware, async (req: Request, res: Response) => {
  const server = new McpServer({ name: "github-mcp-server", version: "1.0.0" });
  registerRepoTools(server);
  registerIssueTools(server);
  registerSearchTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT ?? "8080");
app.listen(port, () => {
  console.error(`GitHub MCP server running on port ${port}`);
});

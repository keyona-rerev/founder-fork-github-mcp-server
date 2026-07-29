import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { registerRepoTools } from "./tools/repos.js";
import { registerIssueTools } from "./tools/issues.js";
import { registerSearchTools } from "./tools/search.js";

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "github-mcp-server", version: "1.0.0" });
});

// GET /mcp — discovery ping from Claude.ai
app.get("/mcp", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", name: "github-mcp-server" });
});

// POST /mcp — MCP protocol handler
app.post("/mcp", async (req: Request, res: Response) => {
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

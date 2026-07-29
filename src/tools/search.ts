import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, truncate, toText } from "../services/github.js";

interface CodeSearchItem {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: { full_name: string };
  text_matches?: { fragment: string }[];
}

interface RepoSearchItem {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
}

interface IssueSearchItem {
  number: number;
  title: string;
  state: string;
  html_url: string;
  repository_url: string;
  user: { login: string };
  created_at: string;
}

export function registerSearchTools(server: McpServer): void {
  // Search code
  server.registerTool(
    "github_search_code",
    {
      title: "Search Code",
      description: `Search for code across GitHub repositories.

Args:
  - query: Search query using GitHub code search syntax. Supports qualifiers like:
      - 'repo:owner/name' to limit to a specific repo
      - 'language:typescript' to filter by language
      - 'path:src/' to search in a directory
      - 'filename:index.ts' to search specific files
      Example: 'useEffect repo:myuser/myrepo language:typescript'
  - per_page: Results per page 1-100 (default: 20)
  - page: Page number (default: 1)

Returns: Array of matching files with path, repo, and matching fragments.`,
      inputSchema: z.object({
        query: z.string().min(1).describe("GitHub code search query with optional qualifiers"),
        per_page: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, per_page, page }) => {
      const params = new URLSearchParams({
        q: query,
        per_page: String(per_page),
        page: String(page),
      });
      const data = await githubRequest<{ total_count: number; items: CodeSearchItem[] }>(
        `/search/code?${params}`,
        "GET"
      );
      const output = {
        total_count: data.total_count,
        results: data.items.map((item) => ({
          repo: item.repository.full_name,
          path: item.path,
          name: item.name,
          sha: item.sha.slice(0, 7),
          url: item.html_url,
          fragments: item.text_matches?.map((m) => m.fragment) ?? [],
        })),
      };
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Search repos
  server.registerTool(
    "github_search_repos",
    {
      title: "Search Repositories",
      description: `Search for GitHub repositories.

Args:
  - query: Search query. Supports qualifiers like:
      - 'user:username' to search a user's repos
      - 'language:python' to filter by language
      - 'stars:>100' to filter by stars
      - 'topic:machine-learning' to filter by topic
      Example: 'AI tools user:someuser language:typescript'
  - sort: Sort by 'stars', 'forks', 'updated', or 'best-match' (default: 'best-match')
  - per_page: Results per page 1-100 (default: 20)

Returns: Array of repos with name, description, stars, language.`,
      inputSchema: z.object({
        query: z.string().min(1).describe("GitHub repository search query"),
        sort: z.enum(["stars", "forks", "updated", "best-match"]).default("best-match"),
        per_page: z.number().int().min(1).max(100).default(20),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, sort, per_page }) => {
      const params = new URLSearchParams({ q: query, sort, per_page: String(per_page) });
      const data = await githubRequest<{ total_count: number; items: RepoSearchItem[] }>(
        `/search/repositories?${params}`
      );
      const output = {
        total_count: data.total_count,
        results: data.items.map((r) => ({
          name: r.full_name,
          description: r.description,
          stars: r.stargazers_count,
          language: r.language,
          updated_at: r.updated_at,
          url: r.html_url,
        })),
      };
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Search issues and PRs
  server.registerTool(
    "github_search_issues",
    {
      title: "Search Issues and Pull Requests",
      description: `Search for issues and pull requests across GitHub.

Args:
  - query: Search query. Supports qualifiers like:
      - 'repo:owner/name' to limit to a repo
      - 'is:issue' or 'is:pr' to filter type
      - 'is:open' or 'is:closed' for state
      - 'author:username' to filter by author
      - 'label:bug' to filter by label
      Example: 'memory leak repo:myuser/myapp is:open is:issue'
  - per_page: Results per page 1-100 (default: 20)
  - page: Page number (default: 1)

Returns: Array of matching issues/PRs with number, title, state, author.`,
      inputSchema: z.object({
        query: z.string().min(1).describe("GitHub issue/PR search query"),
        per_page: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, per_page, page }) => {
      const params = new URLSearchParams({ q: query, per_page: String(per_page), page: String(page) });
      const data = await githubRequest<{ total_count: number; items: IssueSearchItem[] }>(
        `/search/issues?${params}`
      );
      const output = {
        total_count: data.total_count,
        results: data.items.map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          author: i.user.login,
          created_at: i.created_at,
          url: i.html_url,
        })),
      };
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Get authenticated user
  server.registerTool(
    "github_get_me",
    {
      title: "Get Authenticated User",
      description: `Get info about the authenticated GitHub user (the owner of the PAT).

Returns: Username, name, email, bio, public repos count, followers.`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const data = await githubRequest<Record<string, unknown>>("/user");
      return { content: [{ type: "text", text: truncate(toText(data)) }] };
    }
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, truncate, toText } from "../services/github.js";

interface Repo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
  private: boolean;
  updated_at: string;
}

interface FileContent {
  type: string;
  name: string;
  path: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
  html_url: string;
}

interface TreeItem {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

interface CommitItem {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
}

interface BranchItem {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export function registerRepoTools(server: McpServer): void {
  // List repos
  server.registerTool(
    "github_list_repos",
    {
      title: "List GitHub Repositories",
      description: `List repositories for the authenticated user.

Args:
  - type: Filter by 'all', 'owner', 'public', 'private', 'member' (default: 'owner')
  - sort: Sort by 'created', 'updated', 'pushed', 'full_name' (default: 'updated')
  - per_page: Number of results 1-100 (default: 30)
  - page: Page number (default: 1)

Returns: Array of repos with name, description, stars, language, default branch, visibility.`,
      inputSchema: z.object({
        type: z.enum(["all", "owner", "public", "private", "member"]).default("owner"),
        sort: z.enum(["created", "updated", "pushed", "full_name"]).default("updated"),
        per_page: z.number().int().min(1).max(100).default(30),
        page: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ type, sort, per_page, page }) => {
      const repos = await githubRequest<Repo[]>(
        `/user/repos?type=${type}&sort=${sort}&per_page=${per_page}&page=${page}`
      );
      const output = repos.map((r) => ({
        name: r.full_name,
        description: r.description,
        url: r.html_url,
        stars: r.stargazers_count,
        language: r.language,
        default_branch: r.default_branch,
        private: r.private,
        updated_at: r.updated_at,
      }));
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Get repo info
  server.registerTool(
    "github_get_repo",
    {
      title: "Get Repository Info",
      description: `Get detailed information about a specific repository.

Args:
  - owner: Repository owner (username or org)
  - repo: Repository name

Returns: Full repo metadata including description, stats, topics, license, default branch.`,
      inputSchema: z.object({
        owner: z.string().describe("Repository owner username or org"),
        repo: z.string().describe("Repository name"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo }) => {
      const data = await githubRequest<Record<string, unknown>>(`/repos/${owner}/${repo}`);
      return { content: [{ type: "text", text: truncate(toText(data)) }] };
    }
  );

  // Get file contents
  server.registerTool(
    "github_get_file",
    {
      title: "Get File Contents",
      description: `Read the contents of a file from a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - path: File path within the repo (e.g., 'src/index.ts')
  - ref: Branch, tag, or commit SHA (default: repo's default branch)

Returns: blob_sha (use this as 'sha' when updating the file) followed by decoded file content.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        path: z.string().describe("File path within the repo"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, path, ref }) => {
      const query = ref ? `?ref=${ref}` : "";
      const data = await githubRequest<FileContent>(`/repos/${owner}/${repo}/contents/${path}${query}`);
      if (data.encoding === "base64" && data.content) {
        const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
        return { content: [{ type: "text", text: `blob_sha: ${data.sha}\n\n${truncate(decoded)}` }] };
      }
      return { content: [{ type: "text", text: `blob_sha: ${data.sha}\n\n${truncate(toText(data))}` }] };
    }
  );

  // List directory contents
  server.registerTool(
    "github_list_directory",
    {
      title: "List Directory Contents",
      description: `List files and directories at a path in a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - path: Directory path (use '' or '/' for root)
  - ref: Branch, tag, or commit SHA (optional)

Returns: Array of files/dirs with name, type, size, path, and blob_sha (use blob_sha as 'sha' when updating a file).`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        path: z.string().default("").describe("Directory path, empty string for root"),
        ref: z.string().optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, path, ref }) => {
      const query = ref ? `?ref=${ref}` : "";
      const safePath = path === "" ? "" : `/${path}`;
      const data = await githubRequest<FileContent[]>(
        `/repos/${owner}/${repo}/contents${safePath}${query}`
      );
      const output = data.map((item) => ({
        name: item.name,
        type: item.type,
        path: item.path,
        size: item.size,
        blob_sha: item.sha,
        url: item.html_url,
      }));
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Get repo tree
  server.registerTool(
    "github_get_tree",
    {
      title: "Get Repository File Tree",
      description: `Get the full file tree of a repository recursively.

Args:
  - owner: Repository owner
  - repo: Repository name
  - tree_sha: Branch name or commit SHA (default: 'HEAD')
  - recursive: Whether to fetch recursively (default: true)

Returns: Flat list of all files and directories with paths, types, and blob_sha (use blob_sha as 'sha' when updating a file).`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        tree_sha: z.string().default("HEAD"),
        recursive: z.boolean().default(true),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, tree_sha, recursive }) => {
      const query = recursive ? "?recursive=1" : "";
      const data = await githubRequest<{ tree: TreeItem[]; truncated: boolean }>(
        `/repos/${owner}/${repo}/git/trees/${tree_sha}${query}`
      );
      const output = {
        truncated: data.truncated,
        files: data.tree.map((item) => ({
          path: item.path,
          type: item.type,
          size: item.size,
          blob_sha: item.sha,
        })),
      };
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Create or update file
  server.registerTool(
    "github_create_or_update_file",
    {
      title: "Create or Update File",
      description: `Create a new file or update an existing file in a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - path: File path within the repo
  - message: Commit message
  - content: File content (plain text, will be base64-encoded automatically)
  - sha: Required when UPDATING an existing file — the blob SHA of the file being replaced
  - branch: Branch to commit to (default: repo's default branch)

Note: this REPLACES the entire file. To change part of a large file, use github_patch_file instead.

Returns: Commit info and file metadata including new blob_sha for future updates.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        path: z.string().describe("File path within the repo"),
        message: z.string().describe("Commit message"),
        content: z.string().describe("File content as plain text"),
        sha: z.string().optional().describe("Required when updating existing file — current blob SHA"),
        branch: z.string().optional().describe("Target branch"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ owner, repo, path, message, content, sha, branch }) => {
      const encoded = Buffer.from(content, "utf-8").toString("base64");
      const body: Record<string, unknown> = { message, content: encoded };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;
      const data = await githubRequest<Record<string, unknown>>(
        `/repos/${owner}/${repo}/contents/${path}`,
        "PUT",
        body
      );
      return { content: [{ type: "text", text: truncate(toText(data)) }] };
    }
  );

  // Patch file — targeted string replacement without resending the whole file
  server.registerTool(
    "github_patch_file",
    {
      title: "Patch File",
      description: `Edit an existing file by replacing exact strings. Does NOT require sending the
whole file back, and does NOT require a SHA — both are handled internally.

Use this instead of github_create_or_update_file whenever you are changing part of a file
that already exists. Only use create_or_update_file for brand new files or full rewrites.

Args:
  - owner: Repository owner
  - repo: Repository name
  - path: File path within the repo
  - edits: Array of { old_str, new_str }. Each old_str must appear EXACTLY ONCE in the file.
           Applied in order. Use new_str: "" to delete.
  - message: Commit message
  - branch: Branch to commit to (default: repo's default branch)

All edits are validated before anything is committed. If any old_str is missing or appears
more than once, the whole call is rejected and the file is left untouched. When an old_str
is not unique, add surrounding lines until it is.

Returns: Commit info, new blob_sha, and a per-edit summary of bytes changed.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        path: z.string().describe("File path within the repo"),
        edits: z
          .array(
            z.object({
              old_str: z.string().min(1).describe("Exact text to find. Must be unique in the file."),
              new_str: z.string().describe("Replacement text. Empty string deletes."),
            })
          )
          .min(1)
          .describe("Edits applied in order"),
        message: z.string().describe("Commit message"),
        branch: z.string().optional().describe("Target branch"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ owner, repo, path, edits, message, branch }) => {
      const query = branch ? `?ref=${encodeURIComponent(branch)}` : "";
      const file = await githubRequest<FileContent>(
        `/repos/${owner}/${repo}/contents/${path}${query}`
      );

      if (Array.isArray(file) || file.type !== "file") {
        throw new Error(`${path} is not a file. Use github_list_directory to inspect it.`);
      }
      if (!file.content || file.encoding !== "base64") {
        throw new Error(
          `${path} is ${file.size} bytes. Files over 1MB return no content from the GitHub contents API. Use github_create_or_update_file instead.`
        );
      }

      const before = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf-8");
      let working = before;
      const applied: string[] = [];

      edits.forEach((edit, i) => {
        const count = working.split(edit.old_str).length - 1;
        if (count === 0) {
          throw new Error(
            `Edit ${i + 1} of ${edits.length}: old_str not found in ${path}. Nothing was committed. Re-read the file — it may have changed, or whitespace may differ.`
          );
        }
        if (count > 1) {
          throw new Error(
            `Edit ${i + 1} of ${edits.length}: old_str appears ${count} times in ${path} and must be unique. Nothing was committed. Add surrounding lines until the match is unique.`
          );
        }
        const delta = edit.new_str.length - edit.old_str.length;
        working = working.replace(edit.old_str, () => edit.new_str);
        applied.push(`edit ${i + 1}: ${delta >= 0 ? "+" : ""}${delta} chars`);
      });

      if (working === before) {
        throw new Error(`No change produced in ${path}. Nothing was committed.`);
      }

      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(working, "utf-8").toString("base64"),
        sha: file.sha,
      };
      if (branch) body.branch = branch;

      const data = await githubRequest<Record<string, unknown>>(
        `/repos/${owner}/${repo}/contents/${path}`,
        "PUT",
        body
      );

      const summary = {
        path,
        edits_applied: edits.length,
        bytes_before: Buffer.byteLength(before, "utf-8"),
        bytes_after: Buffer.byteLength(working, "utf-8"),
        detail: applied,
        commit: data,
      };
      return { content: [{ type: "text", text: truncate(toText(summary)) }] };
    }
  );

  // List commits
  server.registerTool(
    "github_list_commits",
    {
      title: "List Commits",
      description: `List commits on a repository branch.

Args:
  - owner: Repository owner
  - repo: Repository name
  - sha: Branch name or commit SHA (optional, defaults to default branch)
  - path: Only commits touching this file path (optional)
  - per_page: Number of results 1-100 (default: 20)
  - page: Page number (default: 1)

Returns: Array of commits with SHA, message, author, date.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        sha: z.string().optional().describe("Branch or commit SHA"),
        path: z.string().optional().describe("Filter to commits touching this path"),
        per_page: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, sha, path, per_page, page }) => {
      const params = new URLSearchParams({ per_page: String(per_page), page: String(page) });
      if (sha) params.set("sha", sha);
      if (path) params.set("path", path);
      const commits = await githubRequest<CommitItem[]>(`/repos/${owner}/${repo}/commits?${params}`);
      const output = commits.map((c) => ({
        sha: c.sha.slice(0, 7),
        full_sha: c.sha,
        message: c.commit.message.split("\n")[0],
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      }));
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // List branches
  server.registerTool(
    "github_list_branches",
    {
      title: "List Branches",
      description: `List branches in a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - per_page: Results per page 1-100 (default: 30)

Returns: Array of branches with name, SHA, and protection status.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        per_page: z.number().int().min(1).max(100).default(30),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, per_page }) => {
      const branches = await githubRequest<BranchItem[]>(
        `/repos/${owner}/${repo}/branches?per_page=${per_page}`
      );
      const output = branches.map((b) => ({
        name: b.name,
        sha: b.commit.sha.slice(0, 7),
        protected: b.protected,
      }));
      return { content: [{ type: "text", text: toText(output) }] };
    }
  );
}

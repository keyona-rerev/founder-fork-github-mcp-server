import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { githubRequest, truncate, toText } from "../services/github.js";

interface Issue {
  number: number;
  title: string;
  state: string;
  body: string | null;
  user: { login: string };
  labels: { name: string }[];
  assignees: { login: string }[];
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_request?: unknown;
  comments: number;
}

interface PR {
  number: number;
  title: string;
  state: string;
  body: string | null;
  user: { login: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  draft: boolean;
  merged: boolean;
  created_at: string;
  updated_at: string;
  html_url: string;
  changed_files: number;
  additions: number;
  deletions: number;
}

interface Comment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
}

export function registerIssueTools(server: McpServer): void {
  // List issues
  server.registerTool(
    "github_list_issues",
    {
      title: "List Issues",
      description: `List issues in a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - state: 'open', 'closed', or 'all' (default: 'open')
  - labels: Comma-separated label names to filter by (optional)
  - assignee: Filter by assignee username (optional)
  - per_page: Results per page 1-100 (default: 20)
  - page: Page number (default: 1)

Returns: Array of issues with number, title, state, labels, author, date. PRs are excluded.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        labels: z.string().optional().describe("Comma-separated label names"),
        assignee: z.string().optional(),
        per_page: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, state, labels, assignee, per_page, page }) => {
      const params = new URLSearchParams({ state, per_page: String(per_page), page: String(page) });
      if (labels) params.set("labels", labels);
      if (assignee) params.set("assignee", assignee);
      const issues = await githubRequest<Issue[]>(`/repos/${owner}/${repo}/issues?${params}`);
      const output = issues
        .filter((i) => !i.pull_request)
        .map((i) => ({
          number: i.number,
          title: i.title,
          state: i.state,
          author: i.user.login,
          labels: i.labels.map((l) => l.name),
          assignees: i.assignees.map((a) => a.login),
          comments: i.comments,
          created_at: i.created_at,
          url: i.html_url,
        }));
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Get issue
  server.registerTool(
    "github_get_issue",
    {
      title: "Get Issue",
      description: `Get detailed info about a specific issue including body text.

Args:
  - owner: Repository owner
  - repo: Repository name
  - issue_number: Issue number

Returns: Full issue details including body, labels, assignees, comments count.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number().int().min(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, issue_number }) => {
      const issue = await githubRequest<Issue>(`/repos/${owner}/${repo}/issues/${issue_number}`);
      const output = {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user.login,
        body: issue.body,
        labels: issue.labels.map((l) => l.name),
        assignees: issue.assignees.map((a) => a.login),
        comments: issue.comments,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        url: issue.html_url,
      };
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Create issue
  server.registerTool(
    "github_create_issue",
    {
      title: "Create Issue",
      description: `Create a new issue in a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - title: Issue title (required)
  - body: Issue body text (optional, supports markdown)
  - labels: Array of label names (optional)
  - assignees: Array of usernames to assign (optional)

Returns: Created issue number, URL, and metadata.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        title: z.string().min(1).describe("Issue title"),
        body: z.string().optional().describe("Issue body (markdown supported)"),
        labels: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ owner, repo, title, body, labels, assignees }) => {
      const issue = await githubRequest<Issue>(`/repos/${owner}/${repo}/issues`, "POST", {
        title,
        ...(body && { body }),
        ...(labels && { labels }),
        ...(assignees && { assignees }),
      });
      return {
        content: [{ type: "text", text: `Created issue #${issue.number}: ${issue.html_url}` }],
      };
    }
  );

  // Update issue
  server.registerTool(
    "github_update_issue",
    {
      title: "Update Issue",
      description: `Update an existing issue — title, body, state, labels, or assignees.

Args:
  - owner: Repository owner
  - repo: Repository name
  - issue_number: Issue number to update
  - title: New title (optional)
  - body: New body text (optional)
  - state: 'open' or 'closed' (optional)
  - labels: Replace all labels with this array (optional)
  - assignees: Replace all assignees with this array (optional)

Returns: Updated issue metadata.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number().int().min(1),
        title: z.string().optional(),
        body: z.string().optional(),
        state: z.enum(["open", "closed"]).optional(),
        labels: z.array(z.string()).optional(),
        assignees: z.array(z.string()).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, issue_number, ...updates }) => {
      const issue = await githubRequest<Issue>(
        `/repos/${owner}/${repo}/issues/${issue_number}`,
        "PATCH",
        updates
      );
      return {
        content: [{ type: "text", text: `Updated issue #${issue.number}: ${issue.html_url}` }],
      };
    }
  );

  // Add comment to issue
  server.registerTool(
    "github_add_issue_comment",
    {
      title: "Add Issue Comment",
      description: `Add a comment to an issue or pull request.

Args:
  - owner: Repository owner
  - repo: Repository name
  - issue_number: Issue or PR number
  - body: Comment text (markdown supported)

Returns: Comment ID and URL.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        issue_number: z.number().int().min(1),
        body: z.string().min(1).describe("Comment text (markdown supported)"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ owner, repo, issue_number, body }) => {
      const comment = await githubRequest<Comment>(
        `/repos/${owner}/${repo}/issues/${issue_number}/comments`,
        "POST",
        { body }
      );
      return { content: [{ type: "text", text: `Comment added: ${comment.id}` }] };
    }
  );

  // List PRs
  server.registerTool(
    "github_list_prs",
    {
      title: "List Pull Requests",
      description: `List pull requests in a repository.

Args:
  - owner: Repository owner
  - repo: Repository name
  - state: 'open', 'closed', or 'all' (default: 'open')
  - base: Filter by base branch (optional)
  - per_page: Results per page 1-100 (default: 20)
  - page: Page number (default: 1)

Returns: Array of PRs with number, title, state, author, head/base branches, draft status.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
        base: z.string().optional().describe("Filter by base branch"),
        per_page: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(1).default(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, state, base, per_page, page }) => {
      const params = new URLSearchParams({ state, per_page: String(per_page), page: String(page) });
      if (base) params.set("base", base);
      const prs = await githubRequest<PR[]>(`/repos/${owner}/${repo}/pulls?${params}`);
      const output = prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user.login,
        head: pr.head.ref,
        base: pr.base.ref,
        draft: pr.draft,
        merged: pr.merged,
        created_at: pr.created_at,
        url: pr.html_url,
      }));
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Get PR
  server.registerTool(
    "github_get_pr",
    {
      title: "Get Pull Request",
      description: `Get detailed info about a specific pull request including body and diff stats.

Args:
  - owner: Repository owner
  - repo: Repository name
  - pr_number: Pull request number

Returns: Full PR details including body, changed files count, additions/deletions.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        pr_number: z.number().int().min(1),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ owner, repo, pr_number }) => {
      const pr = await githubRequest<PR>(`/repos/${owner}/${repo}/pulls/${pr_number}`);
      const output = {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        author: pr.user.login,
        body: pr.body,
        head: pr.head.ref,
        base: pr.base.ref,
        draft: pr.draft,
        merged: pr.merged,
        changed_files: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        url: pr.html_url,
      };
      return { content: [{ type: "text", text: truncate(toText(output)) }] };
    }
  );

  // Merge PR
  server.registerTool(
    "github_merge_pr",
    {
      title: "Merge Pull Request",
      description: `Merge a pull request.

Args:
  - owner: Repository owner
  - repo: Repository name
  - pr_number: Pull request number
  - commit_title: Title for the merge commit (optional)
  - commit_message: Body for the merge commit (optional)
  - merge_method: 'merge', 'squash', or 'rebase' (default: 'merge')

Returns: Merge SHA and success status.`,
      inputSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        pr_number: z.number().int().min(1),
        commit_title: z.string().optional(),
        commit_message: z.string().optional(),
        merge_method: z.enum(["merge", "squash", "rebase"]).default("merge"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ owner, repo, pr_number, commit_title, commit_message, merge_method }) => {
      const result = await githubRequest<{ sha: string; merged: boolean; message: string }>(
        `/repos/${owner}/${repo}/pulls/${pr_number}/merge`,
        "PUT",
        {
          merge_method,
          ...(commit_title && { commit_title }),
          ...(commit_message && { commit_message }),
        }
      );
      return {
        content: [{ type: "text", text: `Merged: ${result.merged}, SHA: ${result.sha}, Message: ${result.message}` }],
      };
    }
  );
}

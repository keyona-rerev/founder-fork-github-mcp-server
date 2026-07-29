# GitHub MCP Server — Setup Guide

## What This Does

A custom MCP server that connects Claude to your GitHub account via the GitHub REST API. Runs on Railway using SSE/HTTP transport, same pattern as your other MCP servers.

Once connected, Claude can read and write files, browse repos, and manage issues and pull requests — 20 tools in all. The full list is at the end of this file.

**Setup is five steps, then a verification step.** Follow them in order — Step 3 produces a token that Steps 4 and 5 both need.

---

## Step 1 — Create a GitHub Personal Access Token

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set a token name (e.g. "Claude MCP Server")
4. Set expiration (90 days or no expiration)
5. Under **Repository access** → select **All repositories** (or specific ones)
6. Under **Permissions**, grant:
   - **Contents** → Read and write
   - **Issues** → Read and write
   - **Pull requests** → Read and write
   - **Metadata** → Read-only (required)
7. Click **Generate token** and copy it — you won't see it again

---

## Step 2 — Fork this repo

Fork this repository to your own GitHub account (click **Fork** at the top right of the repo page, then **Create fork**).

---

## Step 3 — Generate your auth token

Your Railway URL will be public. Without a shared secret, anyone who has the URL can use your MCP server — and it holds a GitHub token with read and write access to your repos. This step is required, and you need the token before you deploy.

Generate a random token:
```
openssl rand -hex 32
```
(On Windows, run this in Git Bash or WSL. Any long random string works.)

You'll get something like:
```
7f3a9c1e4b8d05a2f6e93c7b104d8fa25e0b6c39d7148af52b93e6c01da874f2
```

Copy it somewhere you can get to it in the next two steps — you'll paste it into Railway in Step 4 and into your Claude connector URL in Step 5.

**Keep this token private.** Anyone with it can use your MCP server as if they were you. If it's ever exposed — pasted into a chat, committed to a repo, shared in a screenshot — generate a new one, update the Railway variable, and update your connector URL.

---

## Step 4 — Deploy to Railway

1. Go to **railway.app** → New Project → Deploy from GitHub repo
2. Select your forked repo
3. Railway will detect the Dockerfile automatically
4. In **Variables**, add all four:
   ```
   GITHUB_TOKEN=your_fine_grained_token_from_step_1
   MCP_AUTH_TOKEN=your_generated_token_from_step_3
   TRANSPORT=http
   PORT=8080
   ```
5. In **Settings → Networking**, generate a public domain
6. Wait for build to complete (2-3 min) — health check at `/health` confirms it's live

**Copy your Railway domain** — you need it for Step 5 and Step 6. It'll look something like:
```
github-mcp-server-production-4abf.up.railway.app
```

**If the deploy fails its healthcheck**, check that `MCP_AUTH_TOKEN` is set. The server refuses to start without it — that's intentional, so it's never running unprotected — but the reason only appears in the Railway deploy logs. Add the variable and Railway will redeploy automatically.

---

## Step 5 — Connect to Claude

1. Go to **claude.ai → Settings → Connectors**
2. Click **Add custom connector** (or "Add MCP server")
3. Enter your Railway domain from Step 4, followed by `/mcp?key=` and your token from Step 3:
   ```
   https://your-railway-domain.up.railway.app/mcp?key=your_generated_token
   ```
   Filled in, that looks like:
   ```
   https://github-mcp-server-production-4abf.up.railway.app/mcp?key=7f3a9c1e4b8d05a2f6e93c7b104d8fa25e0b6c39d7148af52b93e6c01da874f2
   ```
4. Save — the connector should show the full list of tools

---

## Step 6 — Verify it's working

Three checks. The first two take a browser; the third takes a Claude conversation.

### 6a. Health endpoint

Open this in your browser, swapping in your own Railway domain from Step 4:
```
https://your-railway-domain.up.railway.app/health
```

Filled in:
```
https://github-mcp-server-production-4abf.up.railway.app/health
```

No key needed for this one. It should return:
```json
{"status": "ok", "server": "github-mcp-server", "version": "1.0.0"}
```

`/health` is intentionally left open so Railway's healthcheck can reach it — it exposes no data and runs no tools.

### 6b. Auth gate

Now open your `/mcp` URL **without** the key:
```
https://your-railway-domain.up.railway.app/mcp
```

It should return:
```json
{"error": "Forbidden"}
```

That means the gate is live. If you get `{"status": "ok", ...}` here instead, your server is running unprotected — go back to Step 4 and confirm `MCP_AUTH_TOKEN` is set in Railway Variables.

### 6c. Full test in Claude

Start a **new conversation** in Claude and paste this in:

> Using my GitHub MCP connector, run these three tool calls and tell me exactly what each one returns:
>
> 1. `github_get_me` — which GitHub account am I authenticated as?
> 2. `github_list_repos` — how many repos come back on the first page?
> 3. `github_get_repo` for one of the repos from that list — does it return real metadata?
>
> If any of them fail, show me the exact error message instead of working around it.

**What a pass looks like:** Claude names your GitHub username, returns a real count of your repos, and returns real metadata for the repo you picked — no errors.

**What a failure looks like, and what it means:**

| What you see | What's wrong |
|---|---|
| `403` / `Forbidden` | The key in your connector URL doesn't match `MCP_AUTH_TOKEN` in Railway. Re-copy it — a truncated paste is the usual cause. |
| Connector shows no tools, or "tool not found" | The connector URL is wrong or the server isn't running. Re-check 6a, then the URL format in Step 5. |
| Tools run but GitHub calls fail with `401` / `Bad credentials` | Your `GITHUB_TOKEN` is wrong or expired. Regenerate it (Step 1) and update the Railway variable. |
| Wrong GitHub account returned | `GITHUB_TOKEN` belongs to a different account than you expected. |

---

## Usage Examples in Claude

> "List all my GitHub repos"

> "Read the contents of README.md in my myorg/myrepo repo"

> "Search my code for any file that imports supabase"

> "Create an issue in my myrepo titled 'Fix auth bug' with label 'bug'"

> "Show me the open PRs in owner/repo"

> "Commit a new file called notes.md to my repo with this content: ..."

---

## Notes

- Both tokens are stored as Railway environment variables — never committed to code
- `MCP_AUTH_TOKEN` is yours alone. Generate your own at deploy time; don't reuse a token from anyone else's deployment
- `github_search_code` requires the repo to be indexed by GitHub (public repos index faster)
- When updating an existing file with `github_create_or_update_file`, you must first get the file's SHA using `github_get_file` and pass it as the `sha` parameter
- Rate limit: GitHub allows 5,000 API requests/hour for authenticated users

---

## Tools Included

Reference list of everything Claude can do once the connector is live.

**Repos and files**
- `github_list_repos` — list your repos
- `github_get_repo` — get detailed repo info
- `github_get_file` — read any file from any repo
- `github_list_directory` — browse repo directory structure
- `github_get_tree` — get full recursive file tree
- `github_create_or_update_file` — create or edit files and commit
- `github_list_commits` — list commits on a branch
- `github_list_branches` — list branches

**Issues**
- `github_list_issues` — list issues (filtered by state, label, assignee)
- `github_get_issue` — read a specific issue with body
- `github_create_issue` — create new issues
- `github_update_issue` — update title, body, state, labels
- `github_add_issue_comment` — comment on issues/PRs

**Pull requests**
- `github_list_prs` — list pull requests
- `github_get_pr` — read PR details and diff stats
- `github_merge_pr` — merge a pull request

**Search**
- `github_search_code` — search code across repos
- `github_search_repos` — search repositories
- `github_search_issues` — search issues and PRs

**Account**
- `github_get_me` — get your authenticated user profile

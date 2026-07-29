# GitHub MCP Server — Setup Guide

## What This Does

A custom MCP server that connects Claude to your GitHub account via the GitHub REST API. Runs on Railway using SSE/HTTP transport, same pattern as your other MCP servers.

**Tools included:**
- `github_list_repos` — list your repos
- `github_get_repo` — get detailed repo info
- `github_get_file` — read any file from any repo
- `github_list_directory` — browse repo directory structure
- `github_get_tree` — get full recursive file tree
- `github_create_or_update_file` — create or edit files and commit
- `github_list_commits` — list commits on a branch
- `github_list_branches` — list branches
- `github_list_issues` — list issues (filtered by state, label, assignee)
- `github_get_issue` — read a specific issue with body
- `github_create_issue` — create new issues
- `github_update_issue` — update title, body, state, labels
- `github_add_issue_comment` — comment on issues/PRs
- `github_list_prs` — list pull requests
- `github_get_pr` — read PR details and diff stats
- `github_merge_pr` — merge a pull request
- `github_search_code` — search code across repos
- `github_search_repos` — search repositories
- `github_search_issues` — search issues and PRs
- `github_get_me` — get your authenticated user profile

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

Copy it somewhere you can get to it in the next two steps — you'll paste it into Railway in Step 4 and into your Claude connector URL in Step 5.

**Keep this token private.** Anyone with it can use your MCP server as if they were you. If it's ever exposed — pasted into a chat, committed to a repo, shared in a screenshot — generate a new one, update the Railway variable, and update your connector URL.

---

## Step 4 — Deploy to Railway

1. Go to **railway.app** → New Project → Deploy from GitHub repo
2. Select your forked repo
3. Railway will detect the Dockerfile automatically
4. In **Variables**, add all four:
   ```
   GITHUB_TOKEN=your_fine_grained_token_here
   MCP_AUTH_TOKEN=your_generated_token_from_step_3
   TRANSPORT=http
   PORT=8080
   ```
5. In **Settings → Networking**, generate a public domain
6. Wait for build to complete (2-3 min) — health check at `/health` confirms it's live

Your URL will be something like: `https://your-repo-name-production.up.railway.app`

**If the deploy fails its healthcheck**, check that `MCP_AUTH_TOKEN` is set. The server refuses to start without it — that's intentional, so it's never running unprotected — but the reason only appears in the Railway deploy logs. Add the variable and Railway will redeploy automatically.

---

## Step 5 — Connect to Claude

1. Go to **claude.ai → Settings → Connectors**
2. Click **Add custom connector** (or "Add MCP server")
3. Enter your Railway URL with your token appended:
   ```
   https://your-app.up.railway.app/mcp?key=your_generated_token_from_step_3
   ```
4. Save — the connector should show the full list of tools

---

## Verify It's Working

Test the health endpoint in your browser:
```
https://your-app.up.railway.app/health
```

Should return:
```json
{"status": "ok", "server": "github-mcp-server", "version": "1.0.0"}
```

`/health` is intentionally left open so Railway's healthcheck can reach it — it exposes no data and runs no tools.

To confirm the auth gate is live, open your `/mcp` URL **without** the key:
```
https://your-app.up.railway.app/mcp
```

Should return:
```json
{"error": "Forbidden"}
```

If you get `{"status": "ok", ...}` there instead, the auth token is not set — go back to Step 4 and check your Railway variables.

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

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

## Step 3 — Deploy to Railway

1. Go to **railway.app** → New Project → Deploy from GitHub repo
2. Select your forked repo
3. Railway will detect the Dockerfile automatically
4. In **Variables**, add:
   ```
   GITHUB_TOKEN=your_fine_grained_token_here
   TRANSPORT=http
   PORT=8080
   ```
5. In **Settings → Networking**, generate a public domain
6. Wait for build to complete (2-3 min) — health check at `/health` confirms it's live

Your URL will be something like: `https://your-repo-name-production.up.railway.app`

---

## Step 4 — Connect to Claude

1. Go to **claude.ai → Settings → Connectors**
2. Click **Add custom connector** (or "Add MCP server")
3. Enter your Railway URL: `https://your-app.up.railway.app/mcp`
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

- The token is stored as a Railway environment variable — never committed to code
- `github_search_code` requires the repo to be indexed by GitHub (public repos index faster)
- When updating an existing file with `github_create_or_update_file`, you must first get the file's SHA using `github_get_file` and pass it as the `sha` parameter
- Rate limit: GitHub allows 5,000 API requests/hour for authenticated users

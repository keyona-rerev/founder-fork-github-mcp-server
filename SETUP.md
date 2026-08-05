# GitHub MCP Server — Setup Guide

## What This Does

A custom MCP server that connects Claude to your GitHub account via the GitHub REST API. Runs on Railway using SSE/HTTP transport, same pattern as your other MCP servers.

Once connected, Claude can read and write files, browse repos, and manage issues and pull requests — 20 tools in all. The full list is at the end of this file.

**Setup is five steps, then a verification step.** Follow them in order — Step 3 produces a token that Steps 4 and 5 both need.

### You will create two different tokens

These get confused constantly, so before you start:

| Token | Who creates it | What it's for |
|---|---|---|
| `GITHUB_TOKEN` | GitHub generates it (Step 1) | Your server's key **into GitHub**. Proves your server is allowed to touch your repos. Starts with `github_pat_`. |
| `MCP_AUTH_TOKEN` | **You invent it** (Step 3) | The lock on **your server's own front door**. Proves whoever is calling your server is you. Just a long random string — nothing to do with GitHub. |

They are not the same value and neither one substitutes for the other.

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

This is your `GITHUB_TOKEN`.

---

## Step 2 — Fork this repo

Fork this repository to your own GitHub account (click **Fork** at the top right of the repo page, then **Create fork**).

**If you forked this repo previously**, your copy is a snapshot from whenever you forked it and may be missing later changes — including the security code in Step 3. On your fork's main page, look at the bar above the file list. If it says *"This branch is N commits behind,"* click **Sync fork → Update branch** before continuing.

---

## Step 3 — Generate your auth token

This is not your GitHub token from Step 1. It's a random string you make up. Nobody issues it to you and it has nothing to do with GitHub.

Your Railway URL is public and its name is guessable, and your server holds a GitHub token that can write to your repos. This is the secret that stops a stranger who finds the URL from using it.

Go to **https://www.random.org/strings/** and set the form to:

- Generate **1** random string
- Each string **32** characters long
- Tick all three character types: numeric digits, uppercase letters, lowercase letters

Click **Get Strings** and copy what it gives you.

Save it somewhere you can get back to. You'll paste it into Railway in Step 4 and into your Claude connector URL in Step 5, and it has to match exactly in both places.

---

## Step 4 — Deploy to Railway

1. Go to **railway.app** → New Project → Deploy from GitHub repo
2. Select your forked repo
3. Railway will detect the Dockerfile automatically
4. Go to the **Variables** tab and add **both** of these:
   ```
   GITHUB_TOKEN=your_github_token_from_step_1
   MCP_AUTH_TOKEN=your_random_string_from_step_3
   ```
   Railway sets `PORT` for you — you don't need to add it.
5. In **Settings → Networking**, generate a public domain
6. Wait for the build to complete (2-3 min)

**Copy your Railway domain** — you need it for Step 5 and Step 6. It'll look something like:
```
github-mcp-server-production-4abf.up.railway.app
```

**What success looks like:** on the **Deployments** tab, the newest deployment has the **ACTIVE** badge and says "Deployment successful."

**If the newest deployment says FAILED**, click **View logs** on that row:
- `MCP_AUTH_TOKEN environment variable is required` → the variable is missing from **this** service in **this** environment. Check the environment dropdown at the top of the window, then re-add it in the Variables tab.
- Anything else → that's a build problem, and the log will name it.

**Important:** when a deploy fails, Railway keeps the *previous* deployment running. Your URL will still work, and the service card will still say **Online** — but it's serving the older build. If you deployed once before adding `MCP_AUTH_TOKEN`, that older build has no security in it. Always check *which* deployment has the ACTIVE badge, not just whether the service says Online.

---

## Step 5 — Connect to Claude

1. Go to **claude.ai → Settings → Connectors**
2. Click **Add custom connector** (or "Add MCP server")
3. Enter your Railway domain from Step 4, followed by `/mcp?key=` and your token from Step 3:
   ```
   https://your-railway-domain.up.railway.app/mcp?key=your_random_string
   ```
   Filled in, that looks like:
   ```
   https://github-mcp-server-production-4abf.up.railway.app/mcp?key=7f3a9c1e4b8d05a2f6e93c7b104d8fa2
   ```
   No space before `?key=`, and paste the token whole — a truncated paste is the most common cause of a 403 later.
4. Save — the connector should show 20 tools, grouped into 15 read-only and 5 write/delete

**Worth doing while you're here:** Claude lets you require approval per tool. The five write tools — Create or Update File, Create Issue, Update Issue, Add Issue Comment, Merge Pull Request — are the ones that change your repos. Consider setting those to ask first, especially on repos with anything real in them.

---

## Step 6 — Verify it's working

Three checks. The first two take a browser; the third takes a Claude conversation.

**Use a fresh Incognito window for 6a and 6b** (Ctrl+Shift+N on Windows, Cmd+Shift+N on Mac). Browsers cache these responses, so a normal tab can show you a stale answer from before your last deploy and send you chasing a problem you already fixed.

### 6a. Health endpoint

Open this, swapping in your own Railway domain from Step 4:
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

### 6b. Auth gate — both halves

**First, without the key:**
```
https://your-railway-domain.up.railway.app/mcp
```
You want:
```json
{"error":"Forbidden"}
```

**Then, with the key:**
```
https://your-railway-domain.up.railway.app/mcp?key=your_random_string
```
You want:
```json
{"status":"ok","name":"github-mcp-server"}
```

Both halves matter. The first proves the door is locked; the second proves your key opens it — which is what the connector depends on.

**If the no-key check returns `{"status":"ok"}`**, your server is running unprotected. In order of likelihood:

1. **A failed deploy left an older build running.** Go to Railway → Deployments and check which row has the **ACTIVE** badge. If it's an older commit, the newest deploy failed — see the troubleshooting note in Step 4.
2. **`MCP_AUTH_TOKEN` isn't set on this service.** Variables tab. Confirm you're in the right environment.
3. **Your fork predates the security code.** Step 2's sync note.
4. **You're seeing a cached response.** Retry in a brand new Incognito window.

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
| `GITHUB_TOKEN environment variable is not set` | You added `MCP_AUTH_TOKEN` but not `GITHUB_TOKEN`, or it's on the wrong service. Step 4. |
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
- Never use your `GITHUB_TOKEN` as your `MCP_AUTH_TOKEN`. It travels in a URL, which means browser history and request logs — a real GitHub credential must never go there
- Rotating either token means updating it in Railway. Rotating `MCP_AUTH_TOKEN` also means updating your Claude connector URL, since the key lives in the URL. Rotate it if it's ever exposed in a chat, a repo, or a screenshot
- `github_search_code` requires the repo to be indexed by GitHub (public repos index faster)
- When updating an existing file with `github_create_or_update_file`, you must first get the file's SHA using `github_get_file` and pass it as the `sha` parameter — or use `github_patch_file`, which handles the SHA for you and only needs the exact text you're changing
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
- `github_patch_file` — edit part of a file by exact string replacement, no SHA needed
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

# GitHub MCP Server

A self-hosted MCP server that gives Claude access to your GitHub account — read files, browse repos, commit changes, and manage issues and pull requests, all from a conversation.

You deploy it to your own Railway account under your own GitHub token, so your code and credentials stay yours.

## Setup

**→ [SETUP.md](SETUP.md)** — full walkthrough, about 15 minutes.

Short version:

1. Create a fine-grained GitHub personal access token
2. Fork this repo (already forked it? sync your fork first)
3. Generate an auth token — a new random string you invent, **not** your GitHub token (`openssl rand -hex 32`)
4. Deploy to Railway with both tokens as variables
5. Add `https://your-app.up.railway.app/mcp?key=your-auth-token` as a custom connector in Claude
6. Verify — `/mcp` without the key should return `403 Forbidden`, with the key should return `ok`

## What Claude can do once it's connected

- Read any file, directory, or full file tree in your repos
- Create and update files with real commits
- List and search repos, commits, and branches
- Create, read, update, and comment on issues
- List, read, and merge pull requests
- Search code, repos, and issues across your account

Claude shows these as 15 read-only tools and 5 write/delete tools, and lets you require approval per tool. Worth gating the write ones.

## Security

The `/mcp` endpoint requires a shared secret passed as `?key=`. Without it, requests are rejected with `403 Forbidden`. The server will not start at all unless `MCP_AUTH_TOKEN` is set, so it can never run unprotected.

**Generate your own auth token.** Do not reuse one from another deployment. Your Railway URL is public, and this server holds a GitHub token with write access to your repos — the auth token is the only thing standing between that and anyone who happens to have your URL.

`/health` is intentionally open so Railway's healthcheck can reach it. It exposes no data and runs no tools.

## Requirements

- A GitHub account
- A Railway account (the free tier is enough to start)
- A Claude plan that supports custom connectors

## Stack

TypeScript, Express, and the official MCP SDK over streamable HTTP. Deployed via Dockerfile; Railway config is in `railway.toml`.

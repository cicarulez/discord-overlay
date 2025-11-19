Contributing Guidelines
======================

Thanks for your interest in contributing to Discord Overlay! Contributions of all kinds are welcome: bug reports, feature requests, documentation, and code.

Language policy
---------------
- English is the default language for documentation, issues, pull requests, and commit messages.
- Optional localized docs can be added as README.<lang>.md files and linked from the English README.

Code of Conduct
---------------
By participating in this project, you agree to abide by our Code of Conduct (see CODE_OF_CONDUCT.md).

Getting started (development)
-----------------------------
- Requirements:
  - Node.js 18 LTS or newer
  - npm (comes with Node.js)
- Install dependencies:
  npm install
- Run the app in development:
  npm start
- Configuration (monorepo):
  - apps/electron (Standalone): open the app and use "Settings" to enter `botToken`, `guildId`, `voiceChannelId`.
  - apps/electron (Client‑Only): in "Settings" set `clientOnly=true` and `backendBaseUrl` (e.g., `http://localhost:5090`).
  - services/discord-service (Backend): copy `.env.sample` to `.env` and set `DISCORD_BOT_TOKEN` (optional `GUILD_ID`, `VOICE_CHANNEL_ID`).
  - apps/angular: start the backend, then set the URL in the app UI under "Backend settings".

Branching and commit style
--------------------------
- Branch names: feat/<short-name>, fix/<short-name>, docs/<short-name>, etc.
- Commits: follow Conventional Commits where possible (e.g., feat: add overlay theme toggle, fix: handle missing intents).

Pull Requests
-------------
Before opening a PR, please:
- Ensure the app starts without errors locally.
- Update docs where applicable (e.g., README.md, comments, config samples).
- Link related issues in the description (e.g., Closes #123).
- Keep changes focused and reasonably small. Large changes are easier to review when split into smaller PRs.

Reporting bugs and requesting features
-------------------------------------
- Use the issue templates (Bug report / Feature request) to file an issue.
- Provide clear steps to reproduce (for bugs) and motivation/use-case (for features).

License
-------
By contributing, you agree that your contributions will be licensed under the repository’s MIT License (see LICENSE).

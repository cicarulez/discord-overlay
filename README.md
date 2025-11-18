Discord Overlay
===============

Electron-based desktop overlay that displays real-time participants and mute status of a Discord voice channel.

Features
- Real-time roster of users in a target Discord voice channel
- Shows speaking and muted status at a glance
- Lightweight Electron app that can stay on top of other windows

Windows fullscreen note
On Windows, the overlay can be shown over games only when the game runs in Windowed or Borderless Fullscreen (windowed borderless) mode.

When a game uses Exclusive Fullscreen, it bypasses the Desktop Window Manager (DWM) and renders directly via the GPU. In this mode, regular OS windows (including Electron overlays) cannot be drawn on top. This is a Windows technical limitation, not an app bug.

Requirements
- Node.js 18 LTS or newer
- A Discord Bot token with the required gateway intents enabled
- Windows, macOS, or Linux

Getting started
1) Install dependencies:
   npm install

2) Configure the app. Copy config.sample.json to config.json and fill in your details:
   Copy-Item config.sample.json config.json  (PowerShell)
   or
   cp config.sample.json config.json  (bash)

   Then edit config.json:
   - botToken: your Discord bot token
   - guildId: the server (guild) ID
   - voiceChannelId: the target voice channel ID to track
   - trackedMember: optional filter; by default it uses mode "id" and a user value

3) Start the app:
   npm start

Configuration
Config is loaded from config.json in the project root. See config.sample.json for an example.

Troubleshooting
- If the overlay shows no users, verify the bot is in the server and has the necessary permissions and intents.
- Ensure the guildId and voiceChannelId are correct and the bot can access that channel.
- Check the console output where you started npm start for errors.
 - If the overlay is not visible over your game on Windows, switch the game to Windowed or Borderless Fullscreen. Exclusive Fullscreen prevents Electron windows from appearing on top.

Roadmap
- Toggleable always-on-top behavior
- Theme customization
- Packaging for distribution (electron-builder)

Contributing
Contributions are welcome. Please read CONTRIBUTING.md for guidelines.

Security
Please report vulnerabilities as described in SECURITY.md.

Support
See SUPPORT.md for how to get help and where to ask questions.

License
This project is licensed under the MIT License. See LICENSE for details.

Acknowledgments
- Built with Electron and discord.js
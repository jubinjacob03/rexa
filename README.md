# Shantha - AI-Powered Discord Bot

An intelligent Discord bot with natural conversation, persistent memory, and seamless server management for Saiyan Gods.

## What It Does

**AI Assistant** - Chat naturally using mentions (@Shantha)

- Understands English, Malayalam, and Manglish
- Remembers conversations across restarts
- Context-aware responses based on the task

**Music Integration** - Control Remani music bot through natural commands

- Play songs, manage queue, control playback
- Now playing displays and queue management

**Server Management** - Automated features with role-based permissions

- Real-time server statistics dashboard
- Anti-nuke protection with instant response to destructive actions
- Moderation control center (timeout, mute, kick, ban, unban) with context-aware target lists
- Verification system for new members
- Private voice channel creation

**Smart Tools** - Built-in capabilities for enhanced responses

- RAG knowledge base for server information
- Web search and content fetching
- Rich Discord embeds for structured information

## Key Features

- **Persistent Memory**: Conversations saved to Supabase, retained across deployments
- **Context Switching**: Specialized responses for music, moderation, welcome, info, and creative tasks
- **Anti-Nuke Protection**: Watches channel/role create & delete, channel renames, mass ban/kick/unban, webhook spam, privilege escalation, and bot joins — untrusted accounts are locked down on the first destructive action while trusted staff are alerted, never auto-banned
- **Role Security**: Strict permission enforcement for destructive actions
- **Multilingual**: Native support for English, Malayalam, and Manglish code-mixing

## Commands

**Slash Commands:**

- `/private` - Create a private voice channel and invite members
- `/join` - Join a private voice channel
- `/leave` - Leave a private voice channel
- `/add` - Add members to your private VC
- `/remove` - Remove members from your private VC
- `/refresh` - Manually refresh the server statistics dashboard (Admin only)
- `/setup-verification` - Set up the verification system (Admin only)
- `/status` - Show bot status and uptime

**AI Interaction:**

- Mention `@Shantha` followed by your message to chat with the AI
- Ask questions, request information, or have natural conversations
- The AI understands English, Malayalam, and Manglish

## Server Protection

**Anti-Nuke** - Real-time protection against server nuking. When enabled, the bot watches destructive gateway events (channel/role create & delete, channel renames, mass ban/kick/unban, webhook creation, role privilege escalation, server-setting changes, and bot joins). Untrusted accounts performing a destructive action are banned on the first event; trusted accounts (the server owner and holders of the configured owner role, plus any whitelisted IDs) are never auto-banned - they only trigger an alert to the mod-log channel.

- Enable **Automod** and **Raid protection** from the Control Center dashboard (both off by default).
- Tune behaviour via `ANTINUKE_INSTANT`, `ANTINUKE_WHITELIST_USERS`, `ANTINUKE_WHITELIST_ROLES`, and `MOD_LOG_CHANNEL_ID` (see `.env.example`). Per-action rate limits live in the `bot_automod` config.
- The bot's role must sit **above** would-be attackers in the role hierarchy for bans to succeed.

**Moderation Control Center** - Timeout, remove-timeout, voice mute/unmute, deafen/undeafen, kick, ban, and unban from a dashboard. Target pickers are context-filtered (for example, "Remove Timeout" lists only members currently timed out and "Unban" lists only banned users). Moderators cannot action anyone whose top role is equal to or above their own, and a per-moderator rate limit caps destructive actions.

## Setup

1. Copy `.env.example` to `.env`
2. Configure environment variables:
   - Discord bot token and credentials
   - Supabase URL and keys (for conversation persistence)
   - OpenRouter API key (for AI model)
3. Install dependencies: `npm install`
4. Deploy slash commands: `node src/deploy-commands.js`
5. Start the bot: `npm start`

## Technology Stack

- **AI Model**: StepFun Step 3.5 Flash via OpenRouter (free, 0.86% tool error rate)
- **Database**: Supabase PostgreSQL with JSONB storage for conversations
- **Framework**: Discord.js v14 with ES modules
- **AI SDK**: Vercel AI SDK v6 for tool calling and agent workflows

## Deployment

Deployed via Docker Compose.

---

**Intelligent. Persistent. Multilingual.** 🤖

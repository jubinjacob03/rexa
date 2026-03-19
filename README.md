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
- Verification system for new members
- Private voice channel creation

**Smart Tools** - Built-in capabilities for enhanced responses

- RAG knowledge base for server information
- Web search and content fetching
- Rich Discord embeds for structured information

## Key Features

- **Persistent Memory**: Conversations saved to Supabase, retained across deployments
- **Context Switching**: Specialized responses for music, moderation, welcome, info, and creative tasks
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

See [DEPLOY.md](DEPLOY.md) for Railway deployment guide.

---

**Intelligent. Persistent. Multilingual.** 🤖

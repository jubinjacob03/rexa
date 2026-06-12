# Shantha AI Agent

AI-powered Discord bot using Vercel AI SDK.

## Structure

```
agents/
├── index.js          # Main export
├── agent.js          # Core agent orchestration
├── config.js         # All configuration (model + agent settings)
├── README.md
│
├── tools/            # All tools and utilities
│   ├── tools.js          # 6 AI tools (RAG, commands, server, music, embeds, images)
│   ├── knowledge-base.js # RAG knowledge storage
│   ├── context-manager.js # Conversation history
│   └── vector-store.js    # AI SDK embeddings (embed, embedMany, cosineSimilarity)
│
└── prompts/          # Markdown prompts
    ├── master-agent.md       # Core personality
    ├── music-context.md
    ├── moderation-context.md
    ├── welcome-context.md
    ├── creative-context.md
    └── info-context.md
```

## Setup

### Environment Variables

```env
# AI Provider (pick one)
AI_MODEL_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Optional
AI_MODEL_NAME=gpt-4o
RAG_ENABLED=true
COMMAND_EXECUTION_ENABLED=true
```

### Integration

```javascript
import { initializeAgentSystem } from "./agents/index.js";

// Initialize
client.once("ready", async () => {
  const agent = await initializeAgentSystem(client);
});

// Handle messages
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.mentions.has(client.user)) return;

  const result = await agent.processMessage(
    message.author.id,
    message.guild.id,
    message.content,
    "music", // Optional: music, moderation, welcome, creative, info
  );

  if (result.success) await message.reply(result.response);
});
```

## Tools

All tools in `tools/tools.js`:

1. **ragTool** - Knowledge search (AI SDK embeddings)
2. **commandExecutorTool** - Execute Discord commands
3. **serverInfoTool** - Real-time server data
4. **musicControlTool** - Remani bot integration
5. **embedTool** (`createEmbed`) - Discord embeds
6. **createPrivateVCTool** - Private voice channels
7. **discordActionTool** - Moderation actions
8. **escalateTicketTool** - Ticket escalation
9. **webSearchTool / webFetchTool / httpRequestTool** - Web access

## Customization

### Edit Personality

Edit markdown files in `prompts/`:

```markdown
# prompts/master-agent.md

You are Shantha, an AI consciousness...
```

### Add Knowledge

```javascript
import { knowledgeBase } from "./agents/index.js";

await knowledgeBase.addKnowledgeBatch([
  { id: "rule-1", text: "Server rule...", metadata: { category: "server" } },
]);
```

### Configure

Edit `config.js`:

```javascript
export default {
  model: { provider: "openai", name: "gpt-4o" },
  rag: { enabled: true, topK: 5 },
  commandExecution: {
    enabled: true,
    blockedCommands: ["ban", "kick"],
  },
};
```

## AI SDK Features

- `embed()` - Single embeddings
- `embedMany()` - Batch embeddings (efficient!)
- `cosineSimilarity()` - Similarity search
- `tool()` - Tool definitions
- `generateText()` - Agent orchestration

---

**Clean, minimal, optimized** 🚀

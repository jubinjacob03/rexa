# Shantha - Personal Assistant for Saiyan Gods

Shantha is the intelligent personal assistant for the Saiyan Gods Discord server. She helps manage the server by handling various tasks automatically, providing real-time insights and information to keep everyone informed.

## 🤖 Capabilities

- **Server Monitoring**: Automatically displays and updates server information in a pinned message
- **Member Insights**: Real-time member counts and online status tracking
- **Role Analytics**: Tracks and displays top roles by member count
- **Command Management**: Provides quick access to all available commands
- **Detailed Statistics**: Comprehensive server analytics on demand

## ✨ Features

- 📊 **Auto-Updating Status**: Displays real-time server information in a pinned message
- 👥 **Member Tracking**: Shows total members and currently online members
- 🎭 **Role Analytics**: Displays top 5 roles by member count
- ⚡ **Command Directory**: Lists all available slash commands
- 🔄 **Real-Time Updates**: Automatically updates when members join/leave or roles change
- 💬 **Slash Commands**: Modern Discord slash command interface
- 📈 **Detailed Reports**: Comprehensive server analytics on demand

## 📋 Prerequisites

- Node.js v16.9.0 or higher
- A Discord Bot Token ([Create one here](https://discord.com/developers/applications))
- Discord Server (Guild) where you have administrator permissions

## 🚀 Quick Start

### 1. Clone or Download

Download Shantha to your local machine.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

2. Edit `.env` with your configuration:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here
   STATUS_CHANNEL_ID=your_status_channel_id_here
   UPDATE_INTERVAL=5
   ```

### 4. Get Required IDs

**Bot Token & Client ID:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to "Bot" section for the token
4. Go to "OAuth2" section for the Client ID

**Guild ID (Server ID):**
1. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
2. Right-click your server icon
3. Click "Copy Server ID"

**Status Channel ID:**
1. Right-click the channel where you want Shantha's server info message
2. Click "Copy Channel ID"

### 5. Invite Shantha to Your Server

Use this URL (replace `YOUR_CLIENT_ID`):
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=412317273088&scope=bot%20applications.commands
```

**Required Permissions:**
- View Channels
- Send Messages
- Embed Links
- Manage Messages (for pinning)
- Read Message History
- Use Slash Commands

### 6. Deploy Slash Commands

```bash
npm run deploy
```

This registers the slash commands to your Discord server.

### 7. Start Shantha

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## 🎮 Available Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/ping` | Check bot latency | Everyone |
| `/help` | Show help information | Everyone |
| `/stats` | View detailed server analytics | Everyone |
| `/refresh` | Manually refresh server info message | Manage Guild |

## 📊 Server Information Display

Shantha maintains a pinned message that displays:

1. **Members**
   - Total member count
   - Currently online members

2. **Server Info**
   - Server creation date
   - Server owner

3. **Top Roles**
   - Top 5 roles by member count
   - Shows role mention and member count

4. **Available Commands**
   - Lists all registered slash commands

## ⚙️ Configuration

### Update Interval

Change `UPDATE_INTERVAL` in `.env` to adjust how often Shantha updates the server info (in minutes):
```env
UPDATE_INTERVAL=5  # Updates every 5 minutes
```

### Key Roles Display

By default, Shantha displays the top 5 roles by member count. To display specific key roles:

1. **Enable Developer Mode in Discord:**
   - Settings > Advanced > Developer Mode

2. **Get Role IDs:**
   - Right-click each role in Server Settings > Roles
   - Click "Copy Role ID"

3. **Add to `.env`:**
```env
KEY_ROLES=123456789012345678,987654321098765432,555555555555555555
```

Leave empty to auto-show top 5 roles by member count.

## 🔧 Troubleshooting

### Shantha doesn't respond
- Make sure Shantha is online
- Check if slash commands are deployed (`npm run deploy`)
- Verify Shantha has proper permissions

### Server info message not updating
- Check `STATUS_CHANNEL_ID` is correct
- Ensure Shantha has "Manage Messages" permission
- Check console for error messages

### Can't see member presences
- Go to Discord Developer Portal
- Select your application > Bot
- Enable "Presence Intent" and "Server Members Intent"

### Commands not showing
- Run `npm run deploy` to register commands
- Wait a few minutes for Discord to update
- Try kicking and re-inviting Shantha

## 📁 Project Structure

```
shantha/
├── src/
│   ├── commands/          # Slash command files
│   │   ├── help.js
│   │   ├── ping.js
│   │   ├── refresh.js
│   │   └── stats.js
│   ├── events/            # Discord event handlers
│   │   ├── ready.js
│   │   ├── guildMemberAdd.js
│   │   ├── guildMemberRemove.js
│   │   └── guildMemberUpdate.js
│   ├── utils/             # Utility functions
│   │   └── statusUpdater.js
│   ├── deploy-commands.js # Command registration script
│   └── index.js           # Main entry point
├── config.js              # Configuration loader
├── package.json           # Dependencies
├── .env                   # Environment variables (create this)
└── .env.example           # Environment template
```

## 🛠️ Development

### Adding New Commands

1. Create a new file in `src/commands/` (e.g., `mycommand.js`)
2. Use this template:

```javascript
import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mycommand')
        .setDescription('My command description'),
    async execute(interaction) {
        await interaction.reply('Hello!');
    },
};
```

3. Run `npm run deploy` to register the command

### Adding New Events

1. Create a new file in `src/events/` (e.g., `myevent.js`)
2. Use this template:

```javascript
import { Events } from 'discord.js';

export default {
    name: Events.EventName,
    async execute(arg1, arg2) {
        // Your event handler code
    },
};
```



## 📝 License

MIT License - Feel free to use and modify Shantha for your own servers!

## 🤝 Support

If you encounter any issues:
1. Check the console output for error messages
2. Verify all configuration values in `.env`
3. Ensure Shantha has proper permissions
4. Make sure all intents are enabled in the Developer Portal

## 🎉 Credits

Built with [Discord.js](https://discord.js.org/) v14

---

**Shantha - Personal Assistant for Saiyan Gods** 🤖⚡

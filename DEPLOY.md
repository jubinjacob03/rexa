# 🚀 Deploying Shantha to Railway

## Prerequisites
- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))

## Step-by-Step Deployment

### 1. Prepare Your Repository
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - Shantha Personal Assistant"

# Create a new repository on GitHub and push
git remote add origin https://github.com/YOUR_USERNAME/shantha.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Railway

1. **Go to [railway.app](https://railway.app)** and sign in with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `shantha` repository

3. **Add Environment Variables**
   Click on your service → Variables tab → Add the following:
   ```
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_client_id_here
   GUILD_ID=your_guild_id_here
   STATUS_CHANNEL_ID=your_channel_id_here
   UPDATE_INTERVAL=5
   KEY_ROLES=role_id_1,role_id_2,role_id_3,role_id_4,role_id_5
   ```
   
   > **Note:** Copy these values from your `.env` file

4. **Done!** Your bot should now be online 24/7
   
   > Commands are automatically deployed on startup - no manual step needed!

## Railway Configuration Files

- **`railway.json`** - Railway deployment settings
- **`nixpacks.toml`** - Build configuration for Node.js
- **`.gitignore`** - Excludes sensitive files from git

## Monitoring

- **Logs**: View in Railway dashboard under "Deployments" tab
- **Restart**: Railway auto-restarts on failures (max 10 retries)
- **Cost**: Railway offers $5 free credits per month (enough for small bots)

## Updating Your Bot

```bash
# Make changes locally, then:
git add .
git commit -m "Update: your changes"
git push

# Railway will automatically redeploy!
```

## Troubleshooting

### Bot is offline
- Check Railway logs for errors
- Verify all environment variables are set correctly
- Ensure Discord bot token is valid

### Commands not showing
- Run `node src/deploy-commands.js` in Railway terminal
- Or redeploy the service

### Need help?
Check Railway docs: [docs.railway.app](https://docs.railway.app)

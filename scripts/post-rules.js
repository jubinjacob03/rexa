/**
 * One-off script: posts the server rules into the rules channel as a single
 * consolidated cyan V2 card (small-caps, numbered blockquotes). Clears the
 * bot's previous posts in the channel first to avoid duplicates.
 *
 * Usage: node scripts/post-rules.js
 */
import {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from "discord.js";
import config from "../config.js";
import { addFooter } from "../src/utils/embed.js";

const CYAN = 0x00ddff;
const RULES_CHANNEL_ID = config.rulesChannelId;

const SMALL_CAPS = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ",
  i: "ɪ", j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ",
  q: "ǫ", r: "ʀ", s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x",
  y: "ʏ", z: "ᴢ",
};

/**
 * Converts text to the small-caps unicode style. Lowercases first so that
 * ALL-CAPS input is also rendered in small caps.
 * @param {string} text
 * @returns {string}
 */
function sc(text) {
  return text.toLowerCase().replace(/[a-z]/g, (ch) => SMALL_CAPS[ch] ?? ch);
}

const NUM = [
  "1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3",
  "5\uFE0F\u20E3", "6\uFE0F\u20E3", "7\uFE0F\u20E3", "8\uFE0F\u20E3",
  "9\uFE0F\u20E3",
];

const RULES = [
  {
    title: "BE RESPECTFUL",
    body: "You must respect all users, regardless of your liking towards them. Treat others the way you want to be treated.",
  },
  {
    title: "NO INAPPROPRIATE LANGUAGE",
    body: "The use of profanity should be kept to a minimum. Any derogatory or targeted language towards any user is prohibited.",
  },
  {
    title: "NO SPAMMING",
    body: "Do not send a large number of small messages back-to-back. Do not disrupt chat by spamming.",
  },
  {
    title: "NO NSFW / ADULT CONTENT",
    body: "Pornographic, adult, or any other NSFW material is not allowed. This is a community server.",
  },
  {
    title: "NO ADVERTISEMENTS",
    body: "Advertising other servers, streams, or services is not allowed. You may share relevant content only in the medias channel if it adds value.",
  },
  {
    title: "VOICE CHANNEL ETIQUETTE",
    body: "Do not join voice channels without permission. If a slot is free, you may ask — but leave if your presence is not wanted.",
  },
  {
    title: "MODERATION",
    body: "The Moderator role is requested via verification and granted only to active, rule-following members. Misuse of power leads to role removal.",
  },
  {
    title: "GAME MODERATORS",
    body: "Dedicated game moderators manage specific games, handling server setup and player whitelisting. Reach out to them for game-specific issues.",
  },
  {
    title: "PROFILE & CONDUCT",
    body: "No inappropriate names or avatars; mods may change nicknames without notice. Toxic behaviour leads to a timeout, repeated offences to a ban.",
  },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  try {
    console.log(`[POST-RULES] Logged in as ${client.user.tag}`);

    const channel = await client.channels.fetch(RULES_CHANNEL_ID);
    if (!channel) throw new Error("Rules channel not found");

    const recent = await channel.messages.fetch({ limit: 50 });
    const mine = recent.filter((m) => m.author.id === client.user.id);
    for (const [, m] of mine) {
      await m.delete().catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
    if (mine.size) console.log(`[POST-RULES] Cleared ${mine.size} previous post(s)`);

    const intro = sc(
      "These are our server rules. By staying in this server, you agree to follow them. Admins and mods may timeout / kick / ban based on your behaviour, at their discretion.",
    );

    const ruleLines = RULES.map(
      (rule, i) =>
        `> ${NUM[i]}\u2800**${sc(rule.title)}**\n> ${sc(rule.body)}`,
    ).join("\n\n");

    const description = `${intro}\n\n${ruleLines}`;

    const iconURL = channel.guild?.iconURL({ size: 256, extension: "png" });

    const container = new ContainerBuilder().setAccentColor(CYAN);
    const bodyText = `## ${sc("RULES")}\n${description}`;

    if (iconURL) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(bodyText),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconURL)),
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(bodyText),
      );
    }
    addFooter(container);

    const payload = {
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    };
    await channel.send(payload);
    console.log("[POST-RULES] Posted consolidated rules card");

    console.log("[POST-RULES] Done.");
  } catch (err) {
    console.error("[POST-RULES] Failed:", err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(config.token);

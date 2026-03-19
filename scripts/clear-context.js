/**
 * Clear Conversation Context
 *
 * Deletes conversation history from the conversation_history table in Supabase.
 * Supports clearing all conversations, or filtering by user/guild.
 *
 * Usage:
 *   node scripts/clear-context.js              # Clear ALL conversations
 *   node scripts/clear-context.js --user <id>  # Clear a specific user's context
 *   node scripts/clear-context.js --guild <id> # Clear all context for a guild
 */

import { createClient } from "@supabase/supabase-js";
import config from "../src/agents/config.js";
import readline from "readline";

const args = process.argv.slice(2);
const userIdx = args.indexOf("--user");
const guildIdx = args.indexOf("--guild");
const forceYes = args.includes("--yes");
const targetUserId = userIdx !== -1 ? args[userIdx + 1] : null;
const targetGuildId = guildIdx !== -1 ? args[guildIdx + 1] : null;

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  if (forceYes) {
    console.log(prompt + "DELETE (auto-confirmed via --yes)");
    return Promise.resolve("DELETE");
  }
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function clearContext() {
  try {
    console.log("=".repeat(70));
    console.log("CLEAR CONVERSATION CONTEXT");
    console.log("=".repeat(70));
    console.log();

    // Build query to fetch what will be deleted
    let query = supabase
      .from("conversation_history")
      .select("context_id, user_id, guild_id, last_activity, messages");
    if (targetUserId) query = query.eq("user_id", targetUserId);
    if (targetGuildId) query = query.eq("guild_id", targetGuildId);

    const { data: rows, error: fetchError } = await query;

    if (fetchError) {
      console.error("❌ Error fetching conversations:", fetchError.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      const scope = targetUserId
        ? `user ${targetUserId}`
        : targetGuildId
          ? `guild ${targetGuildId}`
          : "all conversations";
      console.log(`✅ No conversations found for ${scope}. Nothing to delete.`);
      rl.close();
      return;
    }

    const totalMessages = rows.reduce(
      (sum, r) => sum + (r.messages?.length || 0),
      0,
    );

    if (targetUserId) {
      console.log(`🎯 Scope: User ID ${targetUserId}`);
    } else if (targetGuildId) {
      console.log(`🎯 Scope: Guild ID ${targetGuildId}`);
    } else {
      console.log("⚠️  WARNING: This will delete ALL conversation context!");
    }

    console.log();
    console.log(`📊 Summary:`);
    console.log(`   Conversations : ${rows.length}`);
    console.log(`   Total messages: ${totalMessages}`);
    console.log();

    // Show per-user breakdown (up to 10)
    const byUser = {};
    rows.forEach((r) => {
      const key = r.user_id || "unknown";
      if (!byUser[key]) byUser[key] = { count: 0, messages: 0 };
      byUser[key].count++;
      byUser[key].messages += r.messages?.length || 0;
    });

    console.log("Conversations to be deleted:");
    Object.entries(byUser)
      .sort((a, b) => b[1].messages - a[1].messages)
      .slice(0, 10)
      .forEach(([userId, info]) => {
        console.log(`  • User ${userId}: ${info.messages} messages`);
      });
    if (Object.keys(byUser).length > 10) {
      console.log(`  ... and ${Object.keys(byUser).length - 10} more users`);
    }

    console.log();

    const answer = forceYes
      ? (console.log(
          'Type "DELETE" to confirm (or anything else to cancel): DELETE (auto-confirmed via --yes)',
        ),
        "DELETE")
      : await question(
          'Type "DELETE" to confirm (or anything else to cancel): ',
        );

    if (answer.trim() !== "DELETE") {
      console.log("\n❌ Cancelled by user");
      rl.close();
      return;
    }

    console.log("\n🗑️  Deleting...");

    let deleteQuery = supabase.from("conversation_history").delete();
    if (targetUserId) {
      deleteQuery = deleteQuery.eq("user_id", targetUserId);
    } else if (targetGuildId) {
      deleteQuery = deleteQuery.eq("guild_id", targetGuildId);
    } else {
      // Delete all — must provide a filter or use neq trick; use gt on created_at epoch
      deleteQuery = deleteQuery.neq(
        "context_id",
        "__placeholder_that_never_matches__",
      );
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error("❌ Delete failed:", deleteError.message);
      process.exit(1);
    }

    console.log(
      `\n✅ Deleted ${rows.length} conversation(s) (${totalMessages} messages) from Supabase.`,
    );
    console.log("   The bot's in-memory context will reset on next restart.");
  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

clearContext();

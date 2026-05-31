/**
 * Ingest docs/RAG.txt into Supabase pgvector
 *
 * This script:
 * 1. Reads the knowledge base file
 * 2. Splits it into semantic sections
 * 3. Generates embeddings using Gemini text-embedding-004 (FREE, 768 dims)
 * 4. Stores in Supabase knowledge_embeddings table
 *
 * Usage: node scripts/ingest-knowledge-base.js
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { addDocument } from "../src/agents/tools/knowledge-base.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse knowledge base file into sections
 */
function parseKnowledgeBase(filePath) {
  console.log(`Reading knowledge base from: ${filePath}`);

  const content = readFileSync(filePath, "utf-8");
  const sections = [];

  // Split by section headers - handle both Unix (\n) and Windows (\r\n) line endings
  // Pattern: 80 equals, newline, title, newline, 80 equals, newline, content
  const sectionRegex =
    /={70,}\r?\n([^\r\n]+)\r?\n={70,}\r?\n([\s\S]*?)(?=\r?\n={70,}|$)/g;

  let match;
  while ((match = sectionRegex.exec(content)) !== null) {
    const title = match[1].trim();
    const body = match[2].trim();

    if (
      title &&
      body &&
      title !== "SHANTHA AI ASSISTANT - KNOWLEDGE BASE FOR RAG"
    ) {
      sections.push({
        title,
        content: `# ${title}\n\n${body}`,
      });
    }
  }

  console.log(`Found ${sections.length} sections`);
  return sections;
}

/**
 * Determine category and tags from section title
 */
function getCategoryAndTags(title) {
  const titleLower = title.toLowerCase();

  let category = "general";
  const tags = [];

  if (titleLower.includes("tool")) {
    category = "tools";
    tags.push("tools", "api");
  } else if (
    titleLower.includes("decision") ||
    titleLower.includes("scenario")
  ) {
    category = "decision-trees";
    tags.push("workflows", "execution");
  } else if (titleLower.includes("remani") || titleLower.includes("music")) {
    category = "music";
    tags.push("remani", "music", "commands");
  } else if (titleLower.includes("command")) {
    category = "commands";
    tags.push("commands", "slash-commands");
  } else if (
    titleLower.includes("server") ||
    titleLower.includes("permission")
  ) {
    category = "server";
    tags.push("server", "permissions", "roles");
  } else if (
    titleLower.includes("community") ||
    titleLower.includes("gaming")
  ) {
    category = "community";
    tags.push("gaming", "members", "community");
  } else if (titleLower.includes("verification")) {
    category = "verification";
    tags.push("verification", "security", "roles");
  } else if (titleLower.includes("private") || titleLower.includes("voice")) {
    category = "private-vc";
    tags.push("voice", "channels", "private-vc");
  } else if (titleLower.includes("question") || titleLower.includes("q&a")) {
    category = "faq";
    tags.push("faq", "help", "common-questions");
  } else if (titleLower.includes("about") || titleLower.includes("shantha")) {
    category = "about";
    tags.push("intro", "personality", "capabilities");
  } else if (titleLower.includes("best practice")) {
    category = "best-practices";
    tags.push("guidelines", "behavior");
  } else if (titleLower.includes("troubleshoot")) {
    category = "troubleshooting";
    tags.push("help", "issues", "problems");
  } else if (titleLower.includes("example")) {
    category = "examples";
    tags.push("examples", "usage");
  }

  return { category, tags };
}

/**
 * Split large sections into smaller chunks if needed
 */
function chunkSection(section, maxChunkSize = 3000) {
  if (section.content.length <= maxChunkSize) {
    return [section];
  }

  console.log(
    `  Section "${section.title}" is large (${section.content.length} chars), splitting...`,
  );

  const subsections = section.content.split(/\n\n(?=[A-Z])/);
  const chunks = [];
  let currentChunk = `# ${section.title}\n\n`;
  let chunkIndex = 1;

  for (const subsection of subsections) {
    if (
      currentChunk.length + subsection.length > maxChunkSize &&
      currentChunk.length > 100
    ) {
      chunks.push({
        title: `${section.title} (Part ${chunkIndex})`,
        content: currentChunk.trim(),
      });
      currentChunk = `# ${section.title} (Part ${chunkIndex + 1})\n\n`;
      chunkIndex++;
    }
    currentChunk += subsection + "\n\n";
  }

  if (currentChunk.length > 100) {
    chunks.push({
      title: `${section.title} (Part ${chunkIndex})`,
      content: currentChunk.trim(),
    });
  }

  console.log(`  Split into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Main ingestion function
 */
async function ingestKnowledgeBase() {
  try {
    console.log("=".repeat(60));
    console.log("SHANTHA KNOWLEDGE BASE INGESTION");
    console.log("=".repeat(60));
    console.log();

    const knowledgeBasePath = join(
      __dirname,
      "../docs/RAG.txt",
    );

    const sections = parseKnowledgeBase(knowledgeBasePath);

    if (sections.length === 0) {
      console.error("❌ No sections found in knowledge base file");
      process.exit(1);
    }

    console.log();
    console.log("Starting ingestion...");
    console.log("─".repeat(60));

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log();
      console.log(`[${i + 1}/${sections.length}] Processing: ${section.title}`);

      const { category, tags } = getCategoryAndTags(section.title);

      const chunks = chunkSection(section);

      for (const chunk of chunks) {
        const docId = chunk.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        try {
          console.log(`  • Adding: ${docId}`);
          console.log(`    Category: ${category}`);
          console.log(`    Tags: ${tags.join(", ")}`);
          console.log(`    Size: ${chunk.content.length} chars`);

          const result = await addDocument(docId, chunk.content, {
            category,
            tags,
            title: chunk.title,
            source: "docs/RAG.txt",
          });

          if (result.success) {
            console.log(`    ✅ Success`);
            successCount++;
          } else {
            console.log(`    ❌ Error: ${result.error}`);
            errorCount++;
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.log(`    ❌ Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    console.log();
    console.log("=".repeat(60));
    console.log("INGESTION COMPLETE");
    console.log("=".repeat(60));
    console.log(`✅ Success: ${successCount} documents`);
    console.log(`❌ Errors: ${errorCount} documents`);
    console.log();

    if (successCount > 0) {
      console.log("🎉 Knowledge base ready for RAG queries!");
      console.log();
      console.log("Test with:");
      console.log('  - "What can Shantha do?"');
      console.log('  - "How do I play music?"');
      console.log('  - "Who is God Blaze?"');
      console.log('  - "What games do we play?"');
    }

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

ingestKnowledgeBase();

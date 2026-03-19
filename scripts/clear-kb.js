/**
 * Clear Knowledge Base
 * 
 * Deletes all documents from the knowledge base
 * Use with caution!
 * 
 * Usage: node scripts/clear-knowledge-base.js
 */

import { createClient } from '@supabase/supabase-js';
import config from '../src/agents/config.js';
import readline from 'readline';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function clearKnowledgeBase() {
  try {
    console.log('='.repeat(70));
    console.log('CLEAR KNOWLEDGE BASE');
    console.log('='.repeat(70));
    console.log();
    console.log('⚠️  WARNING: This will delete ALL documents from knowledge_embeddings!');
    console.log();
    
    // Get current document count
    const { data: docs, error: countError } = await supabase
      .from('knowledge_embeddings')
      .select('id, category');
    
    if (countError) {
      console.error('❌ Error:', countError.message);
      process.exit(1);
    }
    
    if (!docs || docs.length === 0) {
      console.log('✅ Knowledge base is already empty');
      process.exit(0);
    }
    
    console.log(`📦 Current documents: ${docs.length}`);
    
    // Group by category
    const byCategory = {};
    docs.forEach(doc => {
      const cat = doc.category || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    
    console.log();
    console.log('Categories to be deleted:');
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`  • ${category}: ${count} documents`);
      });
    
    console.log();
    
    // Confirm deletion
    const answer = await question('Type "DELETE" to confirm (or anything else to cancel): ');
    
    if (answer.trim() !== 'DELETE') {
      console.log('\n❌ Cancelled by user');
      rl.close();
      process.exit(0);
    }
    
    console.log();
    console.log('Deleting documents...');
    
    // Delete all documents
    const { error: deleteError } = await supabase
      .from('knowledge_embeddings')
      .delete()
      .neq('id', ''); // Delete all (workaround for delete without condition)
    
    if (deleteError) {
      console.error('❌ Delete error:', deleteError.message);
      rl.close();
      process.exit(1);
    }
    
    console.log('✅ All documents deleted successfully');
    console.log();
    console.log('To re-populate the knowledge base, run:');
    console.log('  node scripts/ingest-knowledge-base.js');
    console.log();
    
    rl.close();
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    rl.close();
    process.exit(1);
  }
}

clearKnowledgeBase();

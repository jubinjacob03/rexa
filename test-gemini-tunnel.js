import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

process.env.GEMINI_HEADLESS = 'false';

console.log('[TEST] Starting Gemini tunnel test...');
console.log('[TEST] Environment check:');
console.log('  GEMINI_EMAIL:', process.env.GEMINI_EMAIL ? '✓ Set' : '✗ Missing');
console.log('  GEMINI_PASSWORD:', process.env.GEMINI_PASSWORD ? '✓ Set' : '✗ Missing');
console.log('  GEMINI_HEADLESS:', process.env.GEMINI_HEADLESS);
console.log('  USE_GEMINI_TUNNEL:', process.env.USE_GEMINI_TUNNEL);

async function testTunnel() {
  try {
    console.log('\n[TEST] Importing Gemini tunnel...');
    const { prewarmTunnel, sendPromptTunnel } = await import('./src/agents/gemini-web-tunnel.js');
    
    console.log('\n[TEST] Pre-warming tunnel (simulating bot startup)...');
    await prewarmTunnel();
    console.log('[TEST] ✅ Tunnel pre-warmed!\n');
    
    console.log('[TEST] Test 1: Sending first message (should be instant - no initialization delay)...');
    const start1 = Date.now();
    const response1 = await sendPromptTunnel('enna ond?');
    const time1 = Date.now() - start1;
    console.log('[TEST] Response 1:', response1);
    console.log('[TEST] Response 1 time:', time1 + 'ms\n');
    
    console.log('[TEST] Waiting 2 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('[TEST] Test 2: Sending second message...');
    const start2 = Date.now();
    const response2 = await sendPromptTunnel('para koche enna ond?');
    const time2 = Date.now() - start2;
    console.log('[TEST] Response 2:', response2);
    console.log('[TEST] Response 2 time:', time2 + 'ms\n');
    
    console.log('[TEST] ✅ All tests passed!');
    console.log(`[TEST] First message: ${time1}ms, Second message: ${time2}ms`);
    process.exit(0);
  } catch (error) {
    console.error('[TEST] ❌ Test failed:', error);
    console.error('[TEST] Stack:', error.stack);
    process.exit(1);
  }
}

testTunnel();

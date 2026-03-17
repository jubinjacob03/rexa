import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

puppeteer.use(StealthPlugin());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class GeminiWebTunnel {
  constructor(options = {}) {
    this.email = options.email || process.env.GEMINI_EMAIL;
    this.password = options.password || process.env.GEMINI_PASSWORD;
    this.browser = null;
    this.page = null;
    this.isAuthenticated = false;
    this.systemPromptSent = false;
    this.cookiesPath = path.join(__dirname, "../../cache/gemini-cookies.json");
    this.headless = options.headless !== false;
  }

  async initialize() {
    try {
      console.log("[GEMINI TUNNEL] Launching browser...");

      this.browser = await puppeteer.launch({
        headless: this.headless ? "new" : false,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--window-size=1920,1080",
        ],
      });

      this.page = await this.browser.newPage();

      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      );

      const cookiesLoaded = await this.loadCookies();

      if (cookiesLoaded) {
        console.log("[GEMINI TUNNEL] 🔄 Loaded saved session, testing...");
        await this.page.goto("https://gemini.google.com/app", {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        await wait(3000);
        const isLoggedIn = await this.checkIfLoggedIn();

        if (isLoggedIn) {
          console.log("[GEMINI TUNNEL] ✅ Session valid! No login needed.");
          this.isAuthenticated = true;
          return true;
        } else {
          console.log(
            "[GEMINI TUNNEL] ⚠️  Session expired, need fresh login...",
          );
        }
      }

      await this.login();
      return true;
    } catch (error) {
      console.error("[GEMINI TUNNEL] Initialization failed:", error);
      throw error;
    }
  }

  async checkIfLoggedIn() {
    try {
      const selectors = [
        'div[contenteditable="true"]',
        'textarea[placeholder*="Enter"]',
        'button[aria-label*="profile"]',
      ];

      for (const selector of selectors) {
        const element = await this.page.$(selector);
        if (element) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async login() {
    try {
      console.log("[GEMINI TUNNEL] Starting login process...");

      await this.page.goto("https://gemini.google.com/app", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      await wait(2000);

      const isLoggedIn = await this.checkIfLoggedIn();
      if (isLoggedIn) {
        console.log("[GEMINI TUNNEL] Already logged in!");
        this.isAuthenticated = true;
        await this.saveCookies();
        return;
      }

      console.log("[GEMINI TUNNEL] Need to login. Looking for login button...");

      try {
        await this.page.waitForSelector(
          'button, a[href*="accounts.google.com"]',
          { timeout: 5000 },
        );
        const signInButton = await this.page.$(
          'button, a[href*="accounts.google.com"]',
        );
        if (signInButton) {
          await signInButton.click();
          await this.page.waitForNavigation({ waitUntil: "networkidle2" });
        }
      } catch (e) {
        console.log(
          "[GEMINI TUNNEL] No sign-in button found, might be on login page already",
        );
      }

      console.log("[GEMINI TUNNEL] Entering email...");
      await this.page.waitForSelector('input[type="email"]', {
        timeout: 10000,
      });
      await this.page.type('input[type="email"]', this.email, { delay: 100 });
      await this.page.keyboard.press("Enter");

      await wait(2000);

      console.log("[GEMINI TUNNEL] Entering password...");
      await this.page.waitForSelector('input[type="password"]', {
        timeout: 10000,
      });
      await this.page.type('input[type="password"]', this.password, {
        delay: 100,
      });
      await this.page.keyboard.press("Enter");

      console.log("[GEMINI TUNNEL] Waiting for login to complete...");

      if (!this.headless) {
        console.log("\n" + "=".repeat(60));
        console.log("⚠️  If 2FA verification appears, please complete it now.");
        console.log("    Waiting up to 2 minutes for you to complete 2FA...");
        console.log("=".repeat(60) + "\n");
      }

      await this.page
        .waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 120000,
        })
        .catch(() =>
          console.log(
            "[GEMINI TUNNEL] Navigation timeout, checking if logged in...",
          ),
        );

      await wait(3000);

      const loginSuccess = await this.checkIfLoggedIn();

      if (loginSuccess) {
        console.log("[GEMINI TUNNEL] ✅ Login successful!");
        this.isAuthenticated = true;
        await this.saveCookies();
        console.log(
          "[GEMINI TUNNEL] 💾 Session saved! Future runs won't need 2FA.",
        );
      } else {
        throw new Error(
          "Login verification failed - might need manual verification (2FA/CAPTCHA)",
        );
      }
    } catch (error) {
      console.error("[GEMINI TUNNEL] Login failed:", error.message);

      console.log("\n" + "=".repeat(60));
      console.log("💡 2FA / Login Solutions:");
      console.log("=".repeat(60));
      console.log("\n1️⃣  RECOMMENDED: Use Google App Password");
      console.log("   - Visit: https://myaccount.google.com/apppasswords");
      console.log('   - Create password for "Gemini Bot"');
      console.log("   - Use that 16-char password in GEMINI_PASSWORD");
      console.log("\n2️⃣  Manual 2FA (One-time):");
      console.log("   - Set GEMINI_HEADLESS=false in .env");
      console.log("   - Run test again, complete 2FA in browser");
      console.log("   - Session will be saved, no 2FA needed next time");
      console.log("\n" + "=".repeat(60) + "\n");

      throw error;
    }
  }

  async initializePersonality() {
    const systemPrompt = `You are Shantha - a casual, friendly Gen Z Discord bot. Communication rules:

1. PERSONALITY: Talk like a friend, not a formal assistant. Use "yo", "ngl", "bet", "fr", "lowkey", no corporate speak.

2. LANGUAGE MIRRORING (CRITICAL):
   - User speaks English → Respond in English only
   - User speaks Manglish → Respond in Manglish only (use: eda, machane, pwoli, adipoli, enthada, sheriya)
   - User speaks Malayalam → Respond in Malayalam only
   - NEVER mix languages unless user does first

3. TONE: Keep it short, casual, expressive. Use emojis when natural.

Examples:
❌ "I shall assist you with that request" 
✅ "yo got it! 👍"
✅ "eda sheriya wait cheyy" (Manglish)
✅ "bet, on it rn" (English)

Respond naturally based on the user's language choice.`;

    console.log("[GEMINI TUNNEL] 🎭 Initializing Shantha personality...");
    
    await this.page.waitForSelector('div[contenteditable="true"], textarea', {
      timeout: 5000,
    });

    const inputSelector = 'div[contenteditable="true"], textarea';
    await this.page.focus(inputSelector);
    await this.page.type(inputSelector, systemPrompt, { delay: 0 });

    const sendButton = await this.page.$(
      'button[aria-label*="Send"], button[type="submit"]',
    );
    if (!sendButton) {
      await this.page.keyboard.press("Enter");
    } else {
      await sendButton.click();
    }

    await wait(2000);
    console.log("[GEMINI TUNNEL] ✅ Shantha personality initialized!");
  }

  async sendPrompt(prompt, options = {}) {
    if (!this.isAuthenticated) {
      throw new Error("Not authenticated. Call initialize() first.");
    }

    try {
      if (!this.systemPromptSent) {
        await this.initializePersonality();
        this.systemPromptSent = true;
      }

      console.log(`[GEMINI TUNNEL] Sending prompt (${prompt.length} chars)...`);

      await this.page.waitForSelector('div[contenteditable="true"], textarea', {
        timeout: 5000,
      });

      await this.page.evaluate(() => {
        const input =
          document.querySelector('div[contenteditable="true"]') ||
          document.querySelector("textarea");
        if (input) {
          input.textContent = "";
          input.value = "";
        }
      });

      const inputSelector = 'div[contenteditable="true"], textarea';
      await this.page.focus(inputSelector);
      await this.page.type(inputSelector, prompt, { delay: 0 });

      const sendButton = await this.page.$(
        'button[aria-label*="Send"], button[type="submit"]',
      );
      if (!sendButton) {
        await this.page.keyboard.press("Enter");
      } else {
        await sendButton.click();
      }

      console.log("[GEMINI TUNNEL] Waiting for response...");

      let previousLength = 0;
      let stableCount = 0;
      let responseText = "";
      
      for (let i = 0; i < 60; i++) {
        await wait(250);
        
        const currentResponse = await this.page.evaluate(() => {
          const main = document.querySelector("main") || document.body;
          const allText = main.innerText;
          const lines = allText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

          const responseLines = [];
          let foundPrompt = false;
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (!foundPrompt && line.length > 5 && 
                !line.match(/^(Copy|Share|Good|Bad|Tools|Fast|Balanced|Precise|Show drafts|Gemini)$/i)) {
              responseLines.unshift(line);
            } else if (foundPrompt) {
              break;
            }
          }
          
          return responseLines.join(" ").trim();
        });
        
        if (currentResponse && currentResponse.length > 20) {
          responseText = currentResponse;

          if (currentResponse.length === previousLength) {
            stableCount++;
            if (stableCount >= 2) {
              break;
            }
          } else {
            stableCount = 0;
            previousLength = currentResponse.length;
          }
        }
      }

      let response = responseText;

      if (!response || response.length < 10) {
        response = await this.page.evaluate(() => {
        const main = document.querySelector("main") || document.body;
        const allText = main.innerText;
        const lines = allText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        const promptIndex = lines.findIndex(
          (l) =>
            l.includes("Hello! Please respond") ||
            l.includes("What did I just ask"),
        );

        if (promptIndex >= 0 && promptIndex < lines.length - 1) {
          const responseLines = lines
            .slice(promptIndex + 1)
            .filter(
              (l) =>
                !l.includes("Gemini") &&
                !l.includes("About") &&
                !l.match(
                  /^(Copy|Share|Good response|Bad response|Tools|Fast|Balanced|Precise|You said|Show drafts)$/i,
                ) &&
                l.length > 2,
            );

          if (responseLines.length > 0) {
            return responseLines.join("\n\n").trim();
          }
        }

        const responseSelectors = [
          '[data-test-id*="model"]',
          '[data-test-id*="response"]',
          "model-response",
          '[class*="model-response"]',
        ];

        for (const selector of responseSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent.trim();
            if (text.length > 20 && !text.includes("Hello! Please respond")) {
              return text;
            }
          }
        }

        const contentElements = Array.from(document.querySelectorAll("p, div"));
        for (let i = contentElements.length - 1; i >= 0; i--) {
          const el = contentElements[i];
          const text = el.textContent.trim();

          if (text.includes("Hello! Please respond")) continue;
          if (text.includes("What did I just ask")) continue;

          if (text.length > 15 && text.match(/[a-zA-Z]{3,}/)) {
            return text;
          }
        }

        const visibleText = (main.innerText || "").trim();
        if (visibleText.length > 50) {
          return visibleText;
        }

        return "";
        });
      }

      if (!response || response.length < 5) {
        console.error(
          "[GEMINI TUNNEL] Failed to extract response. Captured:",
          response,
        );

        await this.page.screenshot({ path: "debug-screenshot.png" });
        console.log("[GEMINI TUNNEL] Screenshot saved to debug-screenshot.png");

        const html = await this.page.content();
        await fs.writeFile("debug-page.html", html);
        console.log("[GEMINI TUNNEL] Page HTML saved to debug-page.html");

        throw new Error("Failed to extract response from page");
      }

      let cleanedResponse = response
        .replace(/^Gemini said\s*/i, "")
        .replace(/You stopped this response\s*$/i, "")
        .trim();

      console.log(`[GEMINI TUNNEL] ✅ Got response (${cleanedResponse.length} chars)`);
      return cleanedResponse;
    } catch (error) {
      console.error("[GEMINI TUNNEL] Error sending prompt:", error);
      throw error;
    }
  }

  async saveCookies() {
    try {
      const cookies = await this.page.cookies();
      await fs.mkdir(path.dirname(this.cookiesPath), { recursive: true });
      await fs.writeFile(this.cookiesPath, JSON.stringify(cookies, null, 2));
      console.log("[GEMINI TUNNEL] Cookies saved");
    } catch (error) {
      console.error("[GEMINI TUNNEL] Failed to save cookies:", error);
    }
  }

  async loadCookies() {
    try {
      const cookiesString = await fs.readFile(this.cookiesPath, "utf8");
      const cookies = JSON.parse(cookiesString);
      await this.page.setCookie(...cookies);
      console.log("[GEMINI TUNNEL] Cookies loaded");
      return true;
    } catch (error) {
      console.log("[GEMINI TUNNEL] No saved cookies found");
      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log("[GEMINI TUNNEL] Browser closed");
    }
  }
}

let tunnelInstance = null;

export async function getTunnel() {
  if (!tunnelInstance) {
    tunnelInstance = new GeminiWebTunnel({
      headless: process.env.GEMINI_HEADLESS !== "false",
    });
    await tunnelInstance.initialize();
  }
  return tunnelInstance;
}

export async function sendPromptTunnel(prompt, options) {
  const tunnel = await getTunnel();
  return await tunnel.sendPrompt(prompt, options);
}

export async function closeTunnel() {
  if (tunnelInstance) {
    await tunnelInstance.close();
    tunnelInstance = null;
  }
}

export default GeminiWebTunnel;

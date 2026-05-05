import "dotenv/config";
import * as cheerio from "cheerio";
import axios from "axios";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { Mistral } from "@mistralai/mistralai";

const execAsync = promisify(exec);
const DEFAULT_CHUNK_SIZE = 12000;
const DEFAULT_MAX_TOKENS = 4096;
const OBSERVE_CONTEXT_LIMIT = 3500;
const THINKING_FILE_PATH = ".agent_thinking.md";
const THINKING_NOTE_CHAR_LIMIT = 1600;
const OBSERVE_DUMP_DIR = ".agent_observations";
const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY
});

async function getTheWeatherOfCity(cityname = "") {
  const url = `https://wttr.in/${cityname.toLowerCase()}?format=%C+%t`;
  const { data } = await axios.get(url, { responseType: "text" });
  return `The Weather of ${cityname} is ${data}`;
}

async function getGithubDetailsAboutUser(username = "") {
  const url = `https://api.github.com/users/${username}`;
  const { data } = await axios.get(url);

  return {
    login: data.login,
    name: data.name,
    blog: data.blog,
    public_repos: data.public_repos
  };
}

async function executeCommand(cmd = "") {
  if (!cmd || typeof cmd !== "string") {
    throw new Error("Command must be a non-empty string.");
  }

  const { stdout, stderr } = await execAsync(cmd, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 5
  });

  return (stdout || stderr || "Command executed.").trim();
}

async function writeProjectFile(rawArgs = "") {
  let parsed;
  try {
    parsed = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    throw new Error("writeProjectFile expects JSON string args.");
  }

  const relativePath = parsed?.path;
  const content = parsed?.content;

  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("writeProjectFile args must include path string.");
  }
  if (typeof content !== "string") {
    throw new Error("writeProjectFile args must include content string.");
  }

  const fullPath = path.resolve(process.cwd(), relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf8");
  return `Wrote ${relativePath} (${content.length} chars)`;
}

async function appendProjectFile(rawArgs = "") {
  let parsed;
  try {
    parsed = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
  } catch {
    throw new Error("appendProjectFile expects JSON string args.");
  }

  const relativePath = parsed?.path;
  const content = parsed?.content;

  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("appendProjectFile args must include path string.");
  }
  if (typeof content !== "string") {
    throw new Error("appendProjectFile args must include content string.");
  }

  const fullPath = path.resolve(process.cwd(), relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.appendFile(fullPath, content, "utf8");
  return `Appended to ${relativePath} (${content.length} chars)`;
}

async function readProjectFile(relativePath = "") {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("readProjectFile expects a path string.");
  }
  const fullPath = path.resolve(process.cwd(), relativePath);
  const data = await fs.readFile(fullPath, "utf8");
  return data;
}

async function listProjectFiles(relativeDir = ".") {
  if (typeof relativeDir !== "string") {
    throw new Error("listProjectFiles expects a directory path string.");
  }
  const fullPath = path.resolve(process.cwd(), relativeDir);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  return entries
    .map((entry) => `${entry.isDirectory() ? "DIR " : "FILE"} ${entry.name}`)
    .join("\n");
}

async function readProjectFileChunk(rawArgs = "") {
  let parsed;
  try {
    parsed = JSON.parse(rawArgs);
  } catch {
    throw new Error("readProjectFileChunk expects JSON string args.");
  }

  const relativePath = parsed?.path;
  const chunkIndex = Number(parsed?.chunk_index ?? 0);
  const chunkSize = Number(parsed?.chunk_size ?? DEFAULT_CHUNK_SIZE);

  if (!relativePath || typeof relativePath !== "string") {
    throw new Error('readProjectFileChunk args must include "path" string.');
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error('"chunk_index" must be an integer >= 0.');
  }
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('"chunk_size" must be a positive integer.');
  }

  const fullPath = path.resolve(process.cwd(), relativePath);
  const text = await fs.readFile(fullPath, "utf8");
  const totalChunks = Math.ceil(text.length / chunkSize);

  if (chunkIndex >= totalChunks) {
    throw new Error(`chunk_index out of range. total_chunks=${totalChunks}`);
  }

  const start = chunkIndex * chunkSize;
  const end = Math.min(start + chunkSize, text.length);
  const chunk = text.slice(start, end);

  return `CHUNK_INFO chunk_index=${chunkIndex} total_chunks=${totalChunks} chunk_size=${chunkSize} start=${start} end=${end} total_chars=${text.length}\n${chunk}`;
}

async function fetchWebPage(url = "") {
  if (!url || typeof url !== "string") {
    throw new Error("fetchWebPage expects a URL string.");
  }
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const { data } = await axios.get(fullUrl, {
    responseType: "text",
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  // Parse with cheerio and extract meaningful content
  const $ = cheerio.load(data);

  // Remove scripts, styles, and other non-visual elements
  $("script, style, noscript, iframe, svg").remove();

  // Extract key structural info
  const title = $("title").text().trim();
  const metaDesc = $("meta[name='description']").attr("content") || "";

  // Extract text content from header, nav, main, sections, footer
  const sections = [];
  $("header, nav, main, section, footer, [class*='hero'], [class*='header'], [class*='footer'], [class*='nav']").each((i, el) => {
    const tag = $(el).prop("tagName").toLowerCase();
    const classes = $(el).attr("class") || "";
    const id = $(el).attr("id") || "";
    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 500);
    if (text.length > 10) {
      sections.push(`<${tag} class="${classes}" id="${id}"> text: ${text}`);
    }
  });

  // Also get all links in nav/header for menu items
  const navLinks = [];
  $("header a, nav a").each((i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr("href") || "";
    if (text && text.length < 50) {
      navLinks.push(`${text} (${href})`);
    }
  });

  const result = [
    `PAGE TITLE: ${title}`,
    `META DESCRIPTION: ${metaDesc}`,
    `\nNAV LINKS: ${navLinks.slice(0, 25).join(" | ")}`,
    `\nPAGE SECTIONS (${sections.length} found):`,
    ...sections.slice(0, 20)
  ].join("\n");

  return result;
}

const toolMap = {
  getTheWeatherOfCity,
  getGithubDetailsAboutUser,
  executeCommand,
  writeProjectFile,
  appendProjectFile,
  readProjectFile,
  listProjectFiles,
  readProjectFileChunk,
  fetchWebPage
};

function getSystemPrompt() {
  return `You are an AI Assistant. You work in START, THINK, TOOL, OBSERVE, OUTPUT steps. Output strict JSON only, one step at a time.

Tools:
- writeProjectFile(args: JSON string {"path":"...","content":"..."}): Create/overwrite a file.
- appendProjectFile(args: JSON string {"path":"...","content":"..."}): Append to existing file.
- readProjectFile(path: string): Read a file.
- listProjectFiles(dir: string): List directory.
- executeCommand(cmd: string): Run a shell command.
- fetchWebPage(url: string): Fetch page structure.

When cloning scaler.com, only create: HEADER + HERO + FOOTER. That is enough.

Scaler.com reference:
- Logo: "SCALER" bold blue #1A73E8
- Nav: PROGRAM, MASTERCLASS, AI LABS, ALUMNI, RESOURCES | Login btn (outlined), PLACEMENT REPORT btn (solid blue)
- Hero: white/light background. Badge: "< THE MARKET HAS ALREADY CHANGED >". Heading: "Become the Professional Built for the Next Decade in AI." ("Built" has light-blue bg, "Next Decade in AI." in blue). Subtext: "The investment that compounds. Strong technical foundations, AI integrated at every stage, and a curriculum that evolves as the market does". Programs: Software Engineering | Modern Data Science and ML | Advanced AI/ML with Agentic AI | DevOps. CTAs: "REQUEST A CALLBACK" (solid blue), "BOOK FREE LIVE CLASS" (outlined)
- Colors: #1A73E8 blue, #0B1B3A dark navy, white bg, sans-serif font
- Footer: dark bg, copyright text

File writing rules:
1. Write CSS first via writeProjectFile with COMPLETE real styles (not placeholders).
2. Write HTML head+opening body via writeProjectFile (do NOT close body/html yet).
3. Append header section via appendProjectFile.
4. Append hero section via appendProjectFile.
5. Append footer + closing </body></html> via appendProjectFile.
6. Write script.js via writeProjectFile.
7. Use real content from reference above. No "Lorem ipsum" or "Add content here" comments.
8. Use \n in content strings for readability.

Rules:
- One step per response. After TOOL wait for OBSERVE.
- Escape JSON strings properly (quotes, newlines).
- Keep THINK steps short.

JSON schema: {"step":"START|THINK|TOOL|OBSERVE|OUTPUT","content":"string","tool_name":"string","tool_args":"string"}
`;
}


function parseAgentJson(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    // Try to extract JSON from surrounding text
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Fall through to repair attempts
      }
    }

    // Attempt to repair truncated JSON (common with token limit hits)
    let repaired = rawText.trim();
    if (!repaired.endsWith("}")) {
      // Find the last complete key-value and close the object
      const lastQuoteIdx = repaired.lastIndexOf('"');
      if (lastQuoteIdx > 0) {
        // Truncated mid-value — try to close the string and object
        repaired = repaired.slice(0, lastQuoteIdx + 1) + "}";
        try {
          return JSON.parse(repaired);
        } catch {
          // Fall through
        }
      }
    }

    throw new Error("Agent did not return valid JSON.");
  }
}

async function initThinkingFile(userInstruction) {
  const header = [
    "# Agent Thinking Log",
    "",
    `Instruction: ${userInstruction}`,
    "",
    "Notes are intentionally concise.",
    ""
  ].join("\n");
  await fs.writeFile(path.resolve(process.cwd(), THINKING_FILE_PATH), header, "utf8");
}

async function appendThinkingNote(stepNumber, content) {
  const concise = String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, THINKING_NOTE_CHAR_LIMIT);
  if (!concise) return;
  const line = `- Step ${stepNumber}: ${concise}\n`;
  await fs.appendFile(path.resolve(process.cwd(), THINKING_FILE_PATH), line, "utf8");
}

async function ensureObserveDumpDir() {
  await fs.mkdir(path.resolve(process.cwd(), OBSERVE_DUMP_DIR), { recursive: true });
}

async function buildObservationForContext(toolName, data, stepNumber) {
  const serialized = typeof data === "string" ? data : JSON.stringify(data);
  if (serialized.length <= OBSERVE_CONTEXT_LIMIT) {
    return serialized;
  }

  await ensureObserveDumpDir();
  const dumpPath = `${OBSERVE_DUMP_DIR}/step_${stepNumber}_${toolName || "tool"}.txt`;
  const fullPath = path.resolve(process.cwd(), dumpPath);
  await fs.writeFile(fullPath, serialized, "utf8");

  const preview = serialized.slice(0, OBSERVE_CONTEXT_LIMIT);
  return [
    `Large observation saved to ${dumpPath}.`,
    "Use chunk tools/read tools if you need more detail.",
    `Preview:\n${preview}`
  ].join("\n");
}

async function runAgentLoop(userInstruction) {
  const model = process.env.MISTRAL_MODEL || "mistral-large-latest";
  const configuredMaxTokens = Number(process.env.MISTRAL_MAX_TOKENS ?? DEFAULT_MAX_TOKENS);
  const maxTokens = Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0
    ? Math.floor(configuredMaxTokens)
    : DEFAULT_MAX_TOKENS;
  const maxSteps = 80;
  let stepCount = 0;
  await initThinkingFile(userInstruction);
  const messages = [
    {
      role: "system",
      content: getSystemPrompt()
    },
    {
      role: "user",
      content: userInstruction
    }
  ];

  while (true) {
    stepCount += 1;
    if (stepCount > maxSteps) {
      console.log("\nMAX STEPS REACHED\n");
      break;
    }

    let response;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await client.chat.complete({
          model,
          messages,
          temperature: 0.2,
          maxTokens: maxTokens,
          responseFormat: { type: "json_object" }
        });
        break; // success — exit retry loop
      } catch (error) {
        const message = error?.message || "Unknown API error.";
        const statusCode = error?.statusCode || error?.status;
        if (statusCode === 429 || message.includes("429") || message.includes("rate limit")) {
          const waitMatch = message.match(/(\d+(\.\d+)?)s/);
          const waitSec = waitMatch ? Math.min(parseFloat(waitMatch[1]), 60) : (attempt * 15);
          console.log(`\nRate limited. Waiting ${Math.ceil(waitSec)}s before retry ${attempt}/${maxRetries}...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          if (attempt === maxRetries) {
            throw new Error(
              `Rate limit reached after ${maxRetries} retries. Try again later or switch model via MISTRAL_MODEL env var.`
            );
          }
          continue;
        }
        if (message.includes("requires more credits") || message.includes("fewer max_tokens")) {
          throw new Error(
            `Mistral credits/token limit reached. Lower MISTRAL_MAX_TOKENS (current: ${maxTokens}) or add credits.`
          );
        }
        // Log full error details for debugging
        console.error(`\nAPI Error (attempt ${attempt}): status=${statusCode}, message=${message}`);
        throw error;
      }
    }

    const content = response.choices[0]?.message?.content ?? "";
    let parsedContent;
    try {
      parsedContent = parseAgentJson(content);
    } catch (error) {
      messages.push({
        role: "user",
        content: JSON.stringify({
          step: "OBSERVE",
          content: "Response was not valid JSON. Return a single JSON object following the schema, no extra text."
        })
      });
      continue;
    }

    messages.push({
      role: "assistant",
      content: JSON.stringify(parsedContent)
    });

    if (parsedContent.step === "START") {
      console.log("\nSTARTING STEP\n", parsedContent);
      messages.push({ role: "user", content: "Proceed to the next step." });
      continue;
    }

    if (parsedContent.step === "THINK") {
      console.log("\nTHINKING STEP\n", parsedContent);
      await appendThinkingNote(stepCount, parsedContent.content);
      messages.push({ role: "user", content: "Proceed to the next step." });
      continue;
    }

    if (parsedContent.step === "TOOL") {
      console.log("\nTOOL STEP\n", parsedContent);

      const toolName = parsedContent.tool_name;
      const toolArgs = parsedContent.tool_args;

      if (!toolMap[toolName]) {
        messages.push({
          role: "user",
          content: JSON.stringify({
            step: "OBSERVE",
            content: `Tool "${toolName}" is not available.`
          })
        });
        continue;
      }

      try {
        const data = await toolMap[toolName](toolArgs);
        const observation = await buildObservationForContext(toolName, data, stepCount);
        messages.push({
          role: "user",
          content: JSON.stringify({
            step: "OBSERVE",
            content: observation
          })
        });
      } catch (error) {
        messages.push({
          role: "user",
          content: JSON.stringify({
            step: "OBSERVE",
            content: `Tool execution failed: ${error.message}`
          })
        });
      }
      continue;
    }

    if (parsedContent.step === "OUTPUT") {
      console.log("\nFINAL OUTPUT\n", parsedContent);
      break;
    }

    messages.push({
      role: "user",
      content: JSON.stringify({
        step: "OBSERVE",
        content: "Invalid step received. Please follow schema strictly."
      })
    });
  }
}

async function main() {
  if (!process.env.MISTRAL_API_KEY) {
    console.error("Missing MISTRAL_API_KEY. Add it to your .env file.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  console.log("AI Agent CLI Tool");
  console.log('Type your instruction. Example: "Clone Scaler Academy homepage."');

  const instruction = await rl.question("\nEnter instruction: ");
  await runAgentLoop(instruction.trim());
  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
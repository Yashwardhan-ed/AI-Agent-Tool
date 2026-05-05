# 🤖 AI Agent CLI Tool — Scaler Landing Page Cloner

A **conversational CLI agent** that takes natural language instructions and autonomously generates a working clone of the [Scaler Academy](https://www.scaler.com) landing page using HTML, CSS, and JavaScript — similar to how AI-powered editors like Cursor or Windsurf operate.

## 📺 Demo Video

[![Watch the Demo](https://img.shields.io/badge/YouTube-Demo_Video-red?style=for-the-badge&logo=youtube)](https://youtu.be/tDlrk3NMPAY)

## Architecture

```
User Instruction
       │
       ▼
┌──────────────┐
│   START      │  ← Acknowledge the task
└──────┬───────┘
       ▼
┌──────────────┐
│   THINK      │  ← Plan the next action
└──────┬───────┘
       ▼
┌──────────────┐
│   TOOL       │  ← Execute a tool (write file, run command, etc.)
└──────┬───────┘
       ▼
┌──────────────┐
│   OBSERVE    │  ← Review the tool's output
└──────┬───────┘
       │
       ▼
  (Loop back to THINK or proceed to OUTPUT)
       │
       ▼
┌──────────────┐
│   OUTPUT     │  ← Final summary
└──────────────┘
```

## 🛠️ Available Tools

| Tool | Description |
|------|-------------|
| `writeProjectFile` | Create or overwrite a file with given content |
| `appendProjectFile` | Append content to an existing file |
| `readProjectFile` | Read a file's contents |
| `readProjectFileChunk` | Read a file in chunks (for large files) |
| `listProjectFiles` | List files in a directory |
| `executeCommand` | Run a shell command |
| `fetchWebPage` | Fetch and parse a web page's structure |
| `getTheWeatherOfCity` | Get live weather data for a city |
| `getGithubDetailsAboutUser` | Get public GitHub profile info |

## 📁 Project Structure

```
.
├── src/
│   └── script.js          # Main agent logic (agent loop, tools, system prompt)
├── scaler_clone/           # Generated output (created by the agent)
│   ├── index.html          # Landing page with Header, Hero, Footer
│   ├── styles.css          # Complete CSS styling
│   └── script.js           # Page JavaScript
├── .env                    # API keys (not committed)
├── .gitignore
├── package.json
├── task.md                 # Assignment specification
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- An **OpenRouter API key** ([get one here](https://openrouter.ai/keys))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Yashwardhan-ed/AI-Agent-Tool.git
   cd AI-Agent-Tool
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the project root:
   ```env
   OPEN_ROUTER_API_KEY=your_openrouter_api_key_here
   ```

4. **Run the agent**
   ```bash
   node src/script.js
   ```

5. **Enter your instruction** when prompted, for example:
   ```
   Clone scaler.com landing page inside scaler_clone folder using HTML/CSS/JS
   ```

6. **Open the result** in your browser:
   ```bash
   open scaler_clone/index.html
   # or on Linux:
   xdg-open scaler_clone/index.html
   ```

### Configuration

You can override the default model and token limits via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPEN_ROUTER_API_KEY` | *(required)* | Your OpenRouter API key |
| `OPENROUTER_MODEL` | `mistralai/mistral-large-2512` | Model to use ([browse models](https://openrouter.ai/models)) |
| `OPENROUTER_MAX_TOKENS` | `4096` | Max tokens per LLM response |

## Dependencies

| Package | Purpose |
|---------|---------|
| `openai` | OpenAI-compatible SDK (used with OpenRouter) |
| `dotenv` | Load environment variables from `.env` |
| `axios` | HTTP requests (web fetching, weather API) |
| `cheerio` | HTML parsing for `fetchWebPage` tool |

## What the Agent Generates

When instructed to clone the Scaler landing page, the agent produces:

- **Header** — SCALER logo, navigation links (PROGRAM, MASTERCLASS, AI LABS, ALUMNI, RESOURCES), Login and PLACEMENT REPORT buttons
- **Hero Section** — Badge text, main heading with styled highlights, program listings, and CTA buttons (REQUEST A CALLBACK, BOOK FREE LIVE CLASS)
- **Footer** — Dark background with copyright text

All styled with Scaler's brand colors (`#1A73E8` blue, `#0B1B3A` dark navy) and clean, responsive CSS.

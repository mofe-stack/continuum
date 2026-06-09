# Continuum — Capture, Save & Resume AI Chats

> 🏆 Winner — Hack the Valley 2026

Continuum is a browser extension that captures an AI chat session and lets you pick it back up in a fresh chat, so you never lose your context when you hit a length or message limit. Capture a conversation on one site, then resume it — with the full history handed over — on another.

It runs entirely on your own device. There's no account, no server, and nothing gets sent anywhere unless you ask it to.

## Get it

The extension is going through store review. Links will go here once it's approved:

- **Chrome Web Store:** _coming soon_
- **Firefox Add-ons:** https://addons.mozilla.org/en-US/firefox/addon/continuum/

Until then, you can run it unpacked — see [Running it locally](#running-it-locally) below.

## What it does

- **Capture a chat.** Click the Continuum button on a supported AI site and it grabs the whole conversation — messages, and any images or files that came with it.
- **Resume somewhere else.** Open a new chat on a supported site and Continuum drops the captured history back in, so the model picks up where you left off instead of starting cold.
- **Save and export.** Captured sessions are kept locally and can be exported to Markdown or PDF.
- **Optional AI compression.** For very long chats, you can have the middle of the conversation summarized down using your own API key, so the handoff fits. This is off by default.

## Supported sites

Right now Continuum works with:

- **Claude** (claude.ai)
- **ChatGPT** (chatgpt.com)
- **Gemini** (gemini.google.com)

More platforms are coming soon.

A captured chat from any of these can be resumed into Claude, ChatGPT, or Gemini today; more sites (Perplexity, Grok, DeepSeek, Copilot) are still being wired up as resume targets. The source and the destination don't have to match — a chat captured on one site can be resumed into another.

## What gets captured

Every site captures the full conversation text. What comes through for **attachments** depends on what each site lets an extension reach:

| | Claude | ChatGPT | Gemini |
|---|:---:|:---:|:---:|
| Messages | ✅ | ✅ | ✅ |
| Images you uploaded | ✅ | ✅ | name only |
| AI-generated images | — | ✅ | name only |
| Files you uploaded | ✅ | ✅ | ✅ |
| AI-generated files | — | ✅ | name only |

**What the symbols mean:**

- ✅: saved in full
- **name only**: listed in the transcript, but the file/image itself isn't saved
- **—**: not captured

**Notes:**

- Gemini serves its images from locked URLs an extension can't download, so they come through by name, not saved.
- Claude captures your normal uploads (images, PDFs, docs, text) fine. The one exception is files that got routed to Claude's code/analysis tool — the ones that, when you click them, say they're too large and you have to download them. Those bytes live only in Claude's temporary sandbox and can't be pulled back out, so they're noted by name. (Files Claude *generates* for you — the download cards — aren't captured either; that's the "—" row above.)

## Privacy

Continuum is local-first. Your conversations and any API keys you enter stay in your browser's own storage on your device.

- No Continuum server, account, or cloud. There's no backend.
- No tracking, analytics, or telemetry.
- Your data only ever leaves your device when **you** trigger it: resuming a chat (the history goes to the AI site you picked) or running the optional AI compression (the text goes to the provider you chose, with your own key).

The full policy is in [PRIVACY.md](./PRIVACY.md).

## Running it locally

You can load the extension unpacked while it's still in review. Build first, then load the folder for your browser:

```bash
node build-chrome.js     # → build/chrome/
node build-firefox.js    # → build/firefox/
```

**Chrome / Opera / Edge**
1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the **`build/chrome`** folder

**Firefox**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select **`build/firefox/manifest.json`**

## Building the packages

Continuum ships from one shared `src/` — only the manifest differs per browser (Chrome uses a service-worker background; Firefox uses a scripts background plus `gecko` settings). The build scripts copy the source as-is — no bundling, minifying, or code generation — and write both an unpacked folder (for loading during dev) and a packaged file (for the store).

```bash
node build-firefox.js    # → build/firefox/  and  continuum-firefox.xpi
node build-chrome.js     # → build/chrome/   and  continuum-chrome.zip
```

## Project layout

```
manifest.firefox.json  Firefox manifest (scripts background + gecko settings)
manifest.chrome.json   Chrome manifest (service-worker background)
src/                   Shared source — used by both builds
  background.js        Background worker (handles cross-origin image fetches, etc.)
  content-script.js    Entry point injected into supported AI sites
  adapters/            Per-site capture logic (Claude, ChatGPT, Gemini)
  core/                Storage, settings, compression, session model, PDF export
  ui/                  Floating button + capture panel
  vendor/              Third-party libs (fflate, jsPDF)
icons/                 Extension icons
tests/                 Unit tests for the adapters, compressor, and sanitizer
build-firefox.js       Builds the Firefox .xpi (+ build/firefox/)
build-chrome.js        Builds the Chrome .zip (+ build/chrome/)
PRIVACY.md             Privacy policy
```

## License

MIT — see [LICENSE](./LICENSE).

## Contact

mofecontinuum@gmail.com

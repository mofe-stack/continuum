# Continuum — Privacy Policy

_Last updated: June 2, 2026_

Continuum is a browser extension that captures an AI chat session and lets you
resume it in a new chat. **Continuum is built local-first: your conversations
and API keys stay on your own device.**

## The short version
- There is **no Continuum server, cloud, or account.** We do not run a backend.
- We **do not collect, sell, transfer, or transmit your data to ourselves** — there is no "us" to send it to.
- **No tracking, no analytics, no telemetry.** Nothing phones home.

## What Continuum stores, and where
Everything Continuum saves lives in your browser's own extension storage
(`chrome.storage.local`) on your device:
- **Captured chat sessions** — the messages, transcripts, and any images/files captured from a conversation.
- **Your settings** — theme, resume message, and AI-compression preferences.
- **API keys** (only if you choose to use the optional "Compress with AI" feature).

This data never leaves your device except in the two cases below, both of which
**you** initiate.

## When data leaves your device (only on your action)
1. **Resuming a chat.** When you click "Resume in new chat," Continuum opens the
   AI site you chose (Claude, ChatGPT, or Gemini) and places your captured
   conversation into that site's chat box / as an attachment. The data goes to
   that AI provider because you asked to continue the conversation there.
2. **AI compression (optional, off by default).** If you turn on "Compress with
   AI," the middle portion of the chat is sent to the AI provider **you select**
   (e.g. Anthropic, OpenAI, Google, Perplexity, Grok, or DeepSeek) using **your
   own API key**, solely to generate a summary. It is sent directly to that
   provider's API — never to Continuum.

## Your API keys
- Keys you enter are stored **locally** in your browser's extension storage.
- A key is sent **only** to the provider it belongs to (your Anthropic key goes
  only to Anthropic, etc.), and **only** when you run AI compression.
- Keys are never transmitted to the developer or any third party.

## Permissions, and why they're used
- **Storage / unlimited storage** — to save your captured chats and settings on your device.
- **Access to `claude.ai`, `chatgpt.com`, `gemini.google.com`** — to read the
  conversation you're viewing so it can be captured, and to fill the chat box
  when you resume.
- **Access to `*.googleusercontent.com`** — to fetch images shown in Gemini chats so they can be captured.
- **Access to AI provider API hosts** (`api.anthropic.com`, `api.openai.com`,
  `generativelanguage.googleapis.com`, `api.perplexity.ai`, `api.x.ai`,
  `api.deepseek.com`) — used **only** for the optional AI-compression feature,
  with your key.

## Data retention & deletion
Your data stays until **you** delete it. You can remove individual sessions, use
multi-select to delete many at once, or use Factory Reset to wipe everything.
Uninstalling the extension also removes its local storage.

## Children
Continuum is a general-purpose productivity tool and is not directed at children.

## Changes
If this policy changes, the "Last updated" date above will change.

## Contact
Questions about privacy? Contact: **mofecontinuum@gmail.com**

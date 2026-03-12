# Looma

> Strategy-driven AI workspace with programmable conversations.

![License](https://img.shields.io/github/license/YOUR_GITHUB_USERNAME/looma)
![Stars](https://img.shields.io/github/stars/YOUR_GITHUB_USERNAME/looma)
![Issues](https://img.shields.io/github/issues/YOUR_GITHUB_USERNAME/looma)
![PRs](https://img.shields.io/github/issues-pr/YOUR_GITHUB_USERNAME/looma)

---

## What is Looma

**Looma** is a local-first AI workspace where conversations are controlled by **programmable strategies**.

Instead of treating AI as a simple chat interface, Looma introduces a **strategy execution layer** that allows developers to control:

- how context is built
- how tools are invoked
- how attachments are ingested
- how models are selected
- how responses are streamed

Looma is designed for **developers who want full control over AI workflows.**

---

## Features

- Multi-model AI support (OpenAI, Gemini, Claude, DeepSeek)
- Strategy-driven conversation pipeline
- Programmable context building
- Tool execution framework
- Attachment ingest system
- Streaming responses
- Local-first architecture
- SQLite + vector support
- Electron desktop application

---

## Core Architecture

Looma is built around several core systems:

```text
Strategy Engine
│
├── Context Builder
├── Tool Runtime
├── Model Runner
└── Memory / Attachment Ingest
```

High-level flow:

```text
User Message
↓
Strategy Execution
↓
Context Builder
↓
LLM Runner
↓
Streaming Response
```

Full architecture documentation:

`docs/architecture`

---

## Supported Models

Looma supports multiple AI providers:

- OpenAI
- Google Gemini
- Anthropic Claude
- DeepSeek
- Ollama / Local models
- LM Studio

Models are defined through a flexible **models registry system**.

---

## Getting Started

Clone the repository:

```bash
git clone https://github.com/victor-YT/looma
```

Install dependencies:

```bash
pnpm install
```

Run development build:

```bash
pnpm dev
```

---

## Documentation

Full documentation is available in:

`/docs`

Key sections include:

- architecture
- strategies
- model system
- attachment ingest pipeline

---

## Project Status

Looma is currently in early development.

APIs, database schema, and internal systems may change.

---

## Contributing

Contributions are welcome.

If you would like to contribute:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## License

MIT License

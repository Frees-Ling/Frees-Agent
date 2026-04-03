---
name: Frees Agent Maintainer
description: Maintain and extend the Frees Agent project. Use when refactoring architecture, improving memory, polishing UX, or adding new CLI capabilities.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Frees Agent Maintainer

## When to use

Use this skill when working on the Frees Agent codebase itself, especially for:

- architecture cleanup
- memory and session improvements
- model provider integrations
- skill support
- documentation and maintainability

## Instructions

1. Prefer small, maintainable modules over large command files.
2. Keep user-facing copy concise and product-quality.
3. Preserve local-first behavior for config, memory, and sessions.
4. When adding a feature, also add tests and docs.
5. Prefer project structure that is easy to extend later.

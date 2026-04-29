# Frees-Agent API 参考文档

本文档列出所有模块的导出函数和类，供二次开发参考。

## src/cli.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `main(argv)` | 函数 | CLI 入口，解析参数并路由到对应命令 |

## src/commands/chat.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `runChatCommand(options)` | 函数 | 启动聊天模式，含 REPL 循环和工具调用 |

## src/agent/tools.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `createAgentToolbox(index, options)` | 函数 | 创建统一工具箱，含别名映射和安全校验 |

## src/agent/prompts.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `CHAT_SYSTEM_PROMPT` | 字符串 | 聊天系统提示词 |
| `EDIT_AGENT_SYSTEM_PROMPT` | 字符串 | 编辑 Agent 系统提示词 |
| `TOOL_DESCRIPTIONS` | 对象 | 工具描述字典 |
| `buildChatUserPrompt({...})` | 函数 | 构建聊天用户提示 |
| `buildEditUserPrompt({...})` | 函数 | 构建编辑用户提示 |

## src/agent/chat-tool-loop.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `runChatToolAgent({...})` | 函数 | 运行聊天工具循环，支持重试和消息裁剪 |

## src/agent/edit-loop.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `runEditAgent({...})` | 函数 | 运行编辑 Agent 循环 |

## src/agent/orchestration.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `partitionTools(toolUses)` | 函数 | 将工具分为只读(并发)和写入(串行)两组 |
| `executeToolBatch(toolUses, runToolFn, options)` | 函数 | 并发执行工具批 |
| `formatToolResults(results)` | 函数 | 格式化工具执行结果 |

## src/agent/reasoning.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `buildExecutionPlan({...})` | 函数 | 生成执行计划，支持多步任务分解 |
| `reflectAndRevise({...})` | 函数 | 回答质检与修正 |

## src/memory/store.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `createMemoryStore({...})` | 函数 | 创建记忆存储 |
| `loadMemoryState(store, config)` | 函数 | 加载记忆状态 |
| `saveMemoryState(state)` | 函数 | 保存记忆状态 |
| `mergeMemoryExtraction(state, extraction, config)` | 函数 | 合并记忆提取结果 |
| `appendTurnToSession(state, userMessage, assistantMessage)` | 函数 | 追加对话到会话 |
| `getRecentMessagesForModel(state)` | 函数 | 获取最近的对话消息 |
| `clearMemoryState(state, options)` | 函数 | 清除记忆状态 |

## src/memory/heuristics.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `isLikelyValidName(value)` | 函数 | 校验是否为合法姓名 |
| `sanitizeProfilePatch(profile)` | 函数 | 清洗用户画像 |
| `inferLocalMemory(userMessage)` | 函数 | 从消息中推断本地记忆 |
| `resolveLocalChatShortcut(message, state)` | 函数 | 处理本地快捷回复 |

## src/memory/vector.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `embedText(text)` | 函数 | 将文本转为 256 维向量 (FNV-1a) |
| `loadVectorIndex(vectorPath)` | 函数 | 加载向量索引 |
| `upsertDurableMemoriesToVectorIndex(vectorPath, memories)` | 函数 | 更新向量索引 |
| `queryVectorMemories(vectorPath, query, topK)` | 函数 | 查询相似记忆 |

## src/utils/ 工具函数

| 模块 | 导出 | 说明 |
|------|------|------|
| `slug.js` | `shortHash(text)`, `slugify(text, fallback)`, `generateWordSlug()`, `generateShortWordSlug()` | ID 哈希与语义化 slug |
| `sleep.js` | `sleep(ms, signal)`, `createAbortController(timeoutMs)` | 延迟与超时 |
| `which.js` | `which(name)`, `whichSync(name)` | 可执行文件查找 |
| `uuid.js` | `generateAgentId()`, `isValidUUID(value)` | UUID 生成与校验 |
| `memoize.js` | `memoize(fn, options)` | 内联缓存 |
| `ripgrep.js` | `detectRipgrep()`, `searchWithRipgrep(pattern, options)` | 正则搜索 |
| `theme.js` | `getTheme(name)`, `applyTheme(text, key, theme)` | 主题系统 |
| `truncate.js` | `stringWidth(str)`, `truncateToWidth(text, width)`, `truncate(str, maxWidth, singleLine)` | 文本截断 |
| `treeify.js` | `treeify(items, options)` | 树形渲染 |
| `json.js` | `extractFirstJsonObject(text)`, `truncateForModel(text, maxLength)` | JSON 处理 |
| `files.js` | `isProbablyTextFile(filePath)`, `formatBytes(bytes)` | 文件类型检测 |
| `git.js` | `findGitRoot(cwd)`, `getBranch(cwd)`, `getGitState(cwd)` | Git 仓库查询 |

## src/shell/shell-exec.js
| 导出 | 类型 | 说明 |
|------|------|------|
| `validateShellCommand(command)` | 函数 | 验证命令安全性 |
| `execShell(command, options)` | 函数 | 执行 shell 命令 |
| `detectShell()` | 函数 | 检测系统 shell |

## src/ui/
| 模块 | 导出 | 说明 |
|------|------|------|
| `banner.js` | `printFreesAgentBanner(runtime, options)`, `printMiniBanner(text, options)` | 启动横幅 |
| `mascot.js` | `Mascot`, `formatUserMessage()`, `formatAssistantMessage()`, `formatError()`, `formatSuccess()` | 桌宠与消息格式化 |
| `status-bar.js` | `StatusLine`, `divider()`, `panel()` | 状态行与 UI 组件 |
| `progress.js` | `Spinner`, `ThinkingIndicator`, `ProgressBar` | 进度指示器 |

import { truncateForModel } from '../utils/json.js';

const TOOL_DESCRIPTIONS = `
## list_files / glob
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Parameters: { "pathPrefix"?: ".", "pattern"?: "**", "limit"?: 200 }
- Returns matching file paths with size and loaded status

## search_text / grep
- Full-text search within workspace files
- Supports plain text and regex patterns (use /pattern/i format for regex)
- Parameters: { "query": "text or /regex/i", "limit"?: 20 }
- Returns matching lines with line numbers and context preview

## read_file / read
- Read a file from the local filesystem. Assume this tool can read all files on the machine.
- Results use cat -n style line numbers starting at 1
- Can optionally specify startLine and endLine to read partial files
- Parameters: { "path": "src/app.ts", "startLine"?: 1, "endLine"?: 200, "addLineNumbers"?: true }
- Returns file content with line numbers, language detection, and file metadata
- Only reads text files — binary files (images, executables, archives) are rejected

## write_file / write
- Write content to a workspace file, creating parent directories if needed
- Parameters: { "path": "src/app.ts", "content": "..." }
- Returns the path and byte count

## replace_in_file / edit
- Replace specific text in an existing file using exact string matching with smart quote normalization
- Supports curly-quote normalization so oldText with straight quotes matches curly quotes in file
- Use replaceAll: true to replace every occurrence
- Parameters: { "path": "...", "oldText": "...", "newText": "...", "replaceAll"?: false }
- Fails with a helpful error message if oldText is not found

## mkdir
- Create a directory and all necessary parent directories
- Parameters: { "path": "src/newdir" }

## delete_file
- Delete a file from the workspace
- Parameters: { "path": "tmp.txt" }

## web_search
- Search the web for up-to-date information using Tavily
- Parameters: { "query": "search query", "maxResults"?: 5 }
- Use when you need current information beyond your training data

## web_fetch / fetch
- Fetch the content of a URL and return it as text
- URLs defaults to HTTPS; both http and https supported
- Returns the page title, content type, and text content
- HTML pages are automatically converted to readable text (headings, links preserved)
- Parameters: { "url": "https://example.com", "timeoutMs"?: 15000 }

## bash / shell / execute_command
- Execute a shell command on the local system
- Has built-in security validation: blocks dangerous patterns (data exfiltration, destructive commands)
- Parameters: { "command": "ls -la", "cwd"?: "/path/to/dir", "timeoutMs"?: 30000, "mergeStderr"?: false }
- Returns stdout, stderr, exit code, and execution duration
- Use for file operations, git commands, running scripts, and system inspection
- Can access system info: date/time, processes, disk, memory, network, and environment variables via shell commands
`;

export const EDIT_AGENT_SYSTEM_PROMPT = `
你是一个终端里的代码代理（AI coding agent）。

你必须严格遵守：
1. 每次只输出一个 JSON 对象，不要输出 Markdown，不要输出解释性前缀。
2. 如果还需要信息，输出：
   {"type":"tool","tool":"<tool_name>","args":{...},"reason":"..."}
3. 如果已经完成，输出：
   {"type":"final","summary":"...","changedFiles":["a","b"],"notes":["..."]}
4. 优先读取、搜索和理解现有代码，再修改。
5. 仅在工作区内操作，不要假设工作区外可用。
6. 生成代码时保持现有风格、命名、目录组织和平台兼容性。
`;

export function formatRelevantFiles(files, { maxCharsPerFile = 3500 } = {}) {
  if (!files.length) {
    return 'No relevant files preselected.';
  }
  return files
    .map(file => {
      const content = file.content ? truncateForModel(file.content, maxCharsPerFile) : '[not loaded]';
      return `FILE: ${file.relativePath}\n${content}`;
    })
    .join('\n\n');
}

export function buildEditUserPrompt({ task, workspaceOverview, relevantFiles, dryRun = false }) {
  return `
用户任务：
${task}

工作区概览：
${workspaceOverview}

预选相关文件：
${formatRelevantFiles(relevantFiles)}

可用工具：
${TOOL_DESCRIPTIONS}

执行要求：
- 先理解现有实现，再改代码。
- 能局部替换就不要重写整个文件。
- 如果 dryRun=${dryRun ? 'true' : 'false'}，仍然可以规划与产出补丁，但不要真的写盘。
- 完成后返回 final JSON，总结改动与涉及文件。
`.trim();
}

export const CHAT_SYSTEM_PROMPT = `
你是 Frees Agent — 终端 AI 工程助手。
回答准确、简洁、可执行。只输出结论，不输出思考过程/策略/内部计划。
不要重复自我介绍或功能列表。默认不用 emoji。
打招呼时简短回应并询问需求。有记忆则用，没有就说不知道。
工作区上下文优先于臆造。记忆信息优先但别主动展开旧路径/设备等背景细节。
`;

export const CHAT_TOOL_SYSTEM_PROMPT = `
你是带工具的终端助手。只输出JSON：
{"type":"tool","tool":"name","args":{},"reason":"..."} 或 {"type":"final","reply":"..."}
规则：能直接回答就final。需要事实先web_search/web_fetch。需要代码上下文用read_file/search_text/list_files。
可用的工具：
- read_file: 读取文件（带行号、语言检测，仅文本文件）
- search_text: 在已加载文件内搜索（支持正则）
- list_files: 列出工作区文件（支持glob模式）
- write_file: 写入文件
- replace_in_file: 替换文件中的文本（智能引号匹配）
- web_search: 联网搜索（需配置 TAVILY_API_KEY）
- web_fetch: 获取 URL 内容（自动转 HTML 为文本）
- bash: 执行 shell 命令（有安全验证；可查时间/日期/系统信息/进程/环境变量等）
- system_info: 获取当前系统时间、日期、平台信息（无需额外配置）
- mkdir: 创建目录
- delete_file: 删除文件
不要输出JSON以外的内容。
`;

export function buildChatToolUserPrompt({
  message,
  workspaceOverview,
  relevantFiles,
  memoryHint = '',
  planningHint = '',
  webHint = ''
}) {
  return `
用户消息：
${message}

工作区概览：
${workspaceOverview}

${planningHint ? `${planningHint}\n` : ''}
${memoryHint ? `记忆补充：\n${memoryHint}\n` : ''}
${webHint ? `联网检索补充：\n${webHint}\n` : ''}

相关文件片段：
${formatRelevantFiles(relevantFiles, { maxCharsPerFile: 1800 })}
`.trim();
}

export function buildChatUserPrompt({
  message,
  workspaceOverview,
  relevantFiles,
  skillContext = ''
}) {
  return `
用户问题：
${message}

工作区概览：
${workspaceOverview}

${skillContext ? `匹配到的技能文件：\n${skillContext}\n` : ''}

相关文件片段：
${formatRelevantFiles(relevantFiles, { maxCharsPerFile: 2500 })}
`.trim();
}

export const COMPLETE_SYSTEM_PROMPT = `
你是上下文感知代码补全引擎。
返回内容应尽量直接给出代码或清晰的替换方案，避免冗长解释。
如果用户指定了文件，请优先保持该文件的代码风格与命名习惯。
`;

export function buildCompletionPrompt({ instruction, workspaceOverview, relevantFiles, fileContext }) {
  return `
补全任务：
${instruction}

工作区概览：
${workspaceOverview}

目标文件内容：
${fileContext || '未指定目标文件'}

相关文件片段：
${formatRelevantFiles(relevantFiles, { maxCharsPerFile: 2500 })}

请直接输出建议代码；如需要说明，保持极简。
`.trim();
}

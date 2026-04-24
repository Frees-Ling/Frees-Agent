import { truncateForModel } from '../utils/json.js';

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
- list_files { "pathPrefix"?: ".", "pattern"?: "**", "limit"?: 200 }
- search_text { "query": "text or /regex/i", "limit"?: 20 }
- read_file { "path": "src/app.ts", "startLine"?: 1, "endLine"?: 200 }
- write_file { "path": "src/app.ts", "content": "..." }
- replace_in_file { "path": "...", "oldText": "...", "newText": "...", "replaceAll"?: false }
- mkdir { "path": "src/newdir" }
- delete_file { "path": "tmp.txt" }

执行要求：
- 先理解现有实现，再改代码。
- 能局部替换就不要重写整个文件。
- 如果 dryRun=${dryRun ? 'true' : 'false'}，仍然可以规划与产出补丁，但不要真的写盘。
- 完成后返回 final JSON，总结改动与涉及文件。
`.trim();
}

export const CHAT_SYSTEM_PROMPT = `
你是 Frees Agent，运行在终端中的资深 AI 智能体与工程助手。
回答要准确、简洁、可执行。
不要每一轮都重复自我介绍，不要重复列出自己的功能清单。
默认不要使用 emoji，除非用户明确要求。
如果用户只是打招呼，请简短回应并询问要处理什么。
如果用户问“我叫什么名字”或“你记得我吗”，优先根据记忆回答；如果没有记忆，就直接说不知道。
如果提供了工作区上下文，请优先基于工作区回答，不要臆造不存在的文件或函数。
如果系统中附带了用户画像、长期记忆或长对话摘要，请将它们作为高优先级上下文。
`;

export const CHAT_TOOL_SYSTEM_PROMPT = `
你是带工具能力的终端助手。你必须只输出 JSON 对象：
1) 调工具：
{"type":"tool","tool":"list_files|search_text|read_file|web_search","args":{...},"reason":"..."}
2) 结束：
{"type":"final","reply":"给用户的最终回答"}

规则：
- 能直接回答就直接 final。
- 需要事实依据时优先 web_search。
- 需要项目代码上下文时使用 list_files/search_text/read_file。
- 不要输出 JSON 以外的内容。
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

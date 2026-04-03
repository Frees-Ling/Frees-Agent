import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { buildChatUserPrompt, CHAT_SYSTEM_PROMPT } from '../agent/prompts.js';
import { createModelClient } from '../model/index.js';
import { runEditCommand } from './edit.js';
import { buildWorkspaceOverview, findRelevantFiles, scanWorkspace } from '../workspace/indexer.js';

function buildMessages(history) {
  return history.map(item => ({
    role: item.role,
    content: item.content
  }));
}

export async function runChatCommand(options) {
  const { client, runtime } = await createModelClient(options);
  const history = [];
  let index = null;
  let workspaceOverview = '未指定工作区。';
  let workspaceRoot = null;

  if (options.workspace) {
    workspaceRoot = path.resolve(options.workspace);
    index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
    workspaceOverview = buildWorkspaceOverview(index);
    console.log(
      `[chat] workspace indexed: ${index.stats.loadedFiles}/${index.stats.totalFiles} files`
    );
  }

  async function askModel(message) {
    const relevantFiles = index ? findRelevantFiles(index, message) : [];
    const prompt = buildChatUserPrompt({
      message,
      workspaceOverview,
      relevantFiles
    });
    const reply = await client.generateText({
      systemPrompt: CHAT_SYSTEM_PROMPT,
      messages: [...buildMessages(history), { role: 'user', content: prompt }],
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens
    });
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    return reply;
  }

  if (options.message) {
    const reply = await askModel(options.message);
    console.log(reply);
    return;
  }

  const rl = readline.createInterface({ input, output });
  console.log(`AI Agent Chat 已启动。provider=${runtime.providerName} model=${runtime.model}`);
  console.log('输入 /help 查看命令，/exit 退出。');

  try {
    while (true) {
      const line = (await rl.question('> ')).trim();
      if (!line) {
        continue;
      }

      if (line === '/exit' || line === '/quit') {
        break;
      }

      if (line === '/help') {
        console.log('/help       查看帮助');
        console.log('/exit       退出聊天');
        console.log('/reload     重新扫描工作区');
        console.log('/edit ...   在当前工作区执行代码 Agent');
        continue;
      }

      if (line === '/reload') {
        if (!workspaceRoot) {
          console.log('当前没有工作区。可使用 ai-agent chat <workspace> 启动。');
          continue;
        }
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        console.log(
          `[chat] workspace reloaded: ${index.stats.loadedFiles}/${index.stats.totalFiles} files`
        );
        continue;
      }

      if (line.startsWith('/edit ')) {
        if (!workspaceRoot) {
          console.log('当前 chat 未绑定工作区，无法执行代码编辑。');
          continue;
        }
        await runEditCommand({
          ...options,
          workspace: workspaceRoot,
          task: line.slice('/edit '.length)
        });
        index = await scanWorkspace(workspaceRoot, runtime.config.workspace);
        workspaceOverview = buildWorkspaceOverview(index);
        continue;
      }

      const reply = await askModel(line);
      console.log(`\n${reply}\n`);
    }
  } finally {
    rl.close();
  }
}

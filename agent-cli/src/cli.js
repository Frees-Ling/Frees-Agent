import { parseArgs } from 'node:util';
import { runChatCommand } from './commands/chat.js';
import { runCompleteCommand } from './commands/complete.js';
import { runConfigCommand } from './commands/config.js';
import { runDoctorCommand } from './commands/doctor.js';
import { runEditCommand } from './commands/edit.js';

const HELP_TEXT = `
Frees Agent

Frees Agent 是一个跨平台终端 AI Agent CLI，支持：
- 终端聊天问答
- 基于工作区上下文的代码理解与代码补全
- 自动扫描指定文件夹并阅读全部可载入代码
- Agent 式自动代码编辑、生成与重构
- 本地模型与云端 API 统一接入
- Windows 与 macOS 平台运行

命令：
  frees-agent chat [workspace] [--message "..."]
  frees-agent edit <workspace> --task "..."
  frees-agent complete <workspace> --instruction "..." [--file path]
  frees-agent doctor [workspace] [--ping]
  frees-agent config init [--force]
  frees-agent config show

通用参数：
  --provider anthropic|ollama|openai-compatible
  --model <name>
  --base-url <url>
  --api-key <key>
  --api-key-env <ENV_NAME>
  --config <path>
  --temperature <number>
  --max-output-tokens <number>
  --verbose
`;

function printHelp() {
  console.log(HELP_TEXT.trim());
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'chat') {
    const parsed = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: {
        workspace: { type: 'string', short: 'w' },
        message: { type: 'string', short: 'm' },
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
        'api-key-env': { type: 'string' },
        config: { type: 'string' },
        temperature: { type: 'string' },
        'max-output-tokens': { type: 'string' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    });

    if (parsed.values.help) {
      printHelp();
      return;
    }

    await runChatCommand({
      workspace: parsed.values.workspace ?? parsed.positionals[0],
      message: parsed.values.message,
      provider: parsed.values.provider,
      model: parsed.values.model,
      baseUrl: parsed.values['base-url'],
      apiKey: parsed.values['api-key'],
      apiKeyEnv: parsed.values['api-key-env'],
      configPath: parsed.values.config,
      temperature:
        parsed.values.temperature !== undefined
          ? Number(parsed.values.temperature)
          : undefined,
      maxOutputTokens:
        parsed.values['max-output-tokens'] !== undefined
          ? Number(parsed.values['max-output-tokens'])
          : undefined,
      verbose: Boolean(parsed.values.verbose)
    });
    return;
  }

  if (command === 'edit') {
    const parsed = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: {
        workspace: { type: 'string', short: 'w' },
        task: { type: 'string', short: 't' },
        'dry-run': { type: 'boolean' },
        'max-steps': { type: 'string' },
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
        'api-key-env': { type: 'string' },
        config: { type: 'string' },
        temperature: { type: 'string' },
        'max-output-tokens': { type: 'string' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    });

    if (parsed.values.help) {
      printHelp();
      return;
    }

    await runEditCommand({
      workspace: parsed.values.workspace ?? parsed.positionals[0],
      task: parsed.values.task,
      dryRun: Boolean(parsed.values['dry-run']),
      maxSteps:
        parsed.values['max-steps'] !== undefined
          ? Number(parsed.values['max-steps'])
          : undefined,
      provider: parsed.values.provider,
      model: parsed.values.model,
      baseUrl: parsed.values['base-url'],
      apiKey: parsed.values['api-key'],
      apiKeyEnv: parsed.values['api-key-env'],
      configPath: parsed.values.config,
      temperature:
        parsed.values.temperature !== undefined
          ? Number(parsed.values.temperature)
          : undefined,
      maxOutputTokens:
        parsed.values['max-output-tokens'] !== undefined
          ? Number(parsed.values['max-output-tokens'])
          : undefined,
      verbose: Boolean(parsed.values.verbose)
    });
    return;
  }

  if (command === 'complete') {
    const parsed = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: {
        workspace: { type: 'string', short: 'w' },
        instruction: { type: 'string', short: 'i' },
        file: { type: 'string', short: 'f' },
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
        'api-key-env': { type: 'string' },
        config: { type: 'string' },
        temperature: { type: 'string' },
        'max-output-tokens': { type: 'string' },
        verbose: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    });

    if (parsed.values.help) {
      printHelp();
      return;
    }

    await runCompleteCommand({
      workspace: parsed.values.workspace ?? parsed.positionals[0],
      instruction: parsed.values.instruction,
      file: parsed.values.file,
      provider: parsed.values.provider,
      model: parsed.values.model,
      baseUrl: parsed.values['base-url'],
      apiKey: parsed.values['api-key'],
      apiKeyEnv: parsed.values['api-key-env'],
      configPath: parsed.values.config,
      temperature:
        parsed.values.temperature !== undefined
          ? Number(parsed.values.temperature)
          : undefined,
      maxOutputTokens:
        parsed.values['max-output-tokens'] !== undefined
          ? Number(parsed.values['max-output-tokens'])
          : undefined,
      verbose: Boolean(parsed.values.verbose)
    });
    return;
  }

  if (command === 'doctor') {
    const parsed = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: {
        workspace: { type: 'string', short: 'w' },
        ping: { type: 'boolean' },
        provider: { type: 'string' },
        model: { type: 'string' },
        'base-url': { type: 'string' },
        'api-key': { type: 'string' },
        'api-key-env': { type: 'string' },
        config: { type: 'string' },
        help: { type: 'boolean', short: 'h' }
      }
    });

    if (parsed.values.help) {
      printHelp();
      return;
    }

    await runDoctorCommand({
      workspace: parsed.values.workspace ?? parsed.positionals[0],
      ping: Boolean(parsed.values.ping),
      provider: parsed.values.provider,
      model: parsed.values.model,
      baseUrl: parsed.values['base-url'],
      apiKey: parsed.values['api-key'],
      apiKeyEnv: parsed.values['api-key-env'],
      configPath: parsed.values.config
    });
    return;
  }

  if (command === 'config') {
    const parsed = parseArgs({
      args: argv.slice(1),
      allowPositionals: true,
      options: {
        config: { type: 'string' },
        force: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' }
      }
    });
    if (parsed.values.help) {
      printHelp();
      return;
    }
    await runConfigCommand({
      subcommand: parsed.positionals[0],
      args: parsed.positionals.slice(1),
      configPath: parsed.values.config,
      force: Boolean(parsed.values.force)
    });
    return;
  }

  throw new Error(`未知命令: ${command}\n\n${HELP_TEXT.trim()}`);
}

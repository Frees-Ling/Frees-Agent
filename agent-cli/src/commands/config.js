import { getConfigPath, loadConfig, writeDefaultConfig } from '../config.js';

export async function runConfigCommand(options) {
  if (options.subcommand === 'init') {
    const configPath = await writeDefaultConfig(options.configPath, {
      force: Boolean(options.force)
    });
    console.log(`配置已写入: ${configPath}`);
    return;
  }

  if (options.subcommand === 'show') {
    const { config, path } = await loadConfig(options.configPath);
    console.log(`# ${path}`);
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  console.log(`config path: ${getConfigPath(options.configPath)}`);
  console.log('用法: frees-agent config init [--force] | frees-agent config show');
}

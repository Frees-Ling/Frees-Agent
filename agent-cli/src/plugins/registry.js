// Plugin system — allows extending agent behavior via lifecycle hooks
// Plugins are .plugin.js files placed alongside SKILL.md in skill directories

export class FreesAgentPlugin {
  constructor(name) {
    this.name = name;
  }

  /** Called before a tool is executed. Return modified args or throw to block. */
  async onToolCall(toolName, args, context) {
    return args;
  }

  /** Called with the user message before processing. Return modified message. */
  async onMessage(userMessage, context) {
    return userMessage;
  }

  /** Called with the assistant response after generation. */
  async onResponse(response, context) {
    return response;
  }

  /** Register additional tools. Return array of {name, description, run(args)}. */
  async getTools() {
    return [];
  }

  /** Return extra text to append to the system prompt. */
  async getSystemPromptExtra() {
    return '';
  }
}

export class PluginRegistry {
  constructor() {
    this.plugins = [];
  }

  register(plugin) {
    if (!(plugin instanceof FreesAgentPlugin)) {
      throw new Error(`插件必须继承 FreesAgentPlugin: ${plugin?.name}`);
    }
    this.plugins.push(plugin);
  }

  async getTools() {
    const tools = [];
    for (const plugin of this.plugins) {
      const pluginTools = await plugin.getTools();
      if (Array.isArray(pluginTools)) {
        tools.push(...pluginTools);
      }
    }
    return tools;
  }

  async getSystemPromptExtra() {
    const extras = await Promise.all(
      this.plugins.map(p => p.getSystemPromptExtra())
    );
    return extras.filter(Boolean).join('\n');
  }

  async runOnMessage(userMessage, context) {
    let msg = userMessage;
    for (const plugin of this.plugins) {
      try {
        msg = await plugin.onMessage(msg, context);
      } catch { /* plugin error skips to next */ }
    }
    return msg;
  }

  async runOnResponse(response, context) {
    let resp = response;
    for (const plugin of this.plugins) {
      try {
        resp = await plugin.onResponse(resp, context);
      } catch { /* plugin error skips to next */ }
    }
    return resp;
  }
}

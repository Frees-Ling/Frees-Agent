# 目前存在的缺陷

- 无法联网，无法使用在线资源。
- 无法真正的做到创建文件夹，在指定目录，并编写代码
- LM Studio MCP配置文件：

```json
{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": [
        "@tavily/mcp"
      ],
      "env": {
        "TAVILY_API_KEY": "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"
      }
    }
  }
}
```

- 模型太呆了，无法理解复杂指令和上下文

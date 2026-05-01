# Skill 文件支持与编写说明

`Frees Agent` 支持 `SKILL.md` 类型的技能文件。Skill 是一种可发现的模块化能力，让 AI Agent 根据用户请求自动加载领域知识和行为指导。本文档详细说明 Skill 的目录约定、文件格式、解析机制、注入原理和最佳实践。

---

## 1. 什么是 Skill

Skill 是一组结构化的指令，告诉 AI Agent 在特定场景下应该如何思考和行动。与简单的系统提示词不同，Skill 具有以下特性：

- **可发现**：Agent 自动扫描目录，无需手动注册
- **模块化**：每个 Skill 封装一个领域能力
- **自动触发**：根据用户请求内容自动匹配
- **带权限约束**：可以限制 Skill 可以使用的工具

Skill 的设计灵感来自 Claude Code 的 Agent Skills 规范：

- https://docs.claude.com/en/docs/claude-code/skills
- https://docs.claude.com/en/docs/agents-and-tools/agent-skills

---

## 2. 目录约定与扫描优先级

### 2.1 支持的目录路径

Frees Agent 从三个层次的目录中扫描 Skill 文件：

```
① 用户全局目录
   ~/.claude/skills/<skill-name>/SKILL.md

② 项目工作区目录
   .claude/skills/<skill-name>/SKILL.md

③ 项目私有目录
   .frees-agent/skills/<skill-name>/SKILL.md
```

### 2.2 扫描优先级

当存在同名的 Skill 时，优先级从高到低为：

```
项目私有 (.frees-agent/) > 工作区 (.claude/) > 用户全局 (~/.claude/)
```

高优先级的 Skill 会覆盖低优先级的同名 Skill，但不会合并。

### 2.3 目录结构示例

```
my-project/
├── .claude/
│   └── skills/
│       ├── code-review/
│       │   └── SKILL.md
│       ├── python-testing/
│       │   └── SKILL.md
│       └── react-best-practices/
│           └── SKILL.md
├── .frees-agent/
│   └── skills/
│       └── project-specific/
│           └── SKILL.md
└── src/
    └── ...
```

---

## 3. SKILL.md 文件格式

### 3.1 基础结构

SKILL.md 文件由两部分组成：YAML frontmatter（元数据）和 Markdown 正文（指令）。

```markdown
---
name: Code Review
description: Review source code for bugs, structure, and missing tests. Use when reviewing code, PRs, or file changes.
allowed-tools: Read, Grep, Glob
---

# Code Review

## Instructions

1. Read the target files.
2. Search for related code.
3. Focus on bugs, regressions, and missing tests.
4. Keep summaries short and findings concrete.
```

### 3.2 Frontmatter 字段详解

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | String | 是 | Skill 的名称，用于显示和匹配 |
| `description` | String | 推荐 | 描述 Skill 的能力和触发场景，用于匹配算法 |
| `allowed-tools` | List | 否 | 允许此 Skill 使用的工具白名单 |
| `blocked-tools` | List | 否 | 禁止此 Skill 使用的工具黑名单 |
| `priority` | String | 否 | 匹配优先级：`high` / `normal` / `low` |
| `depends-on` | List | 否 | 依赖的其他 Skill 名称列表 |
| `triggers` | List | 否 | 自动触发条件：文件模式或事件 |
| `auto-load-refs` | Boolean | 否 | 是否自动加载引用文件 |

### 3.3 Markdown 正文约定

正文部分应包含以下结构：

```markdown
# <Skill Name>

## Instructions
1. 步骤一：具体的操作说明
2. 步骤二：需要遵守的约束
3. 步骤三：输出格式要求

## Examples
（可选）提供一个或多个使用示例，帮助模型理解。

## Rules
（可选）列出此 Skill 需要遵守的规则。
```

---

## 4. Skill 匹配与注入机制

### 4.1 匹配流程

```
用户消息 "请帮我 review 这段代码"
    │
    ▼
loader.js: loadAllSkills()
    │
    ├── 扫描三个目录 → 返回所有 SKILL.md
    ├── 解析 frontmatter → 提取结构化元数据
    └── 返回 skill 对象数组 [{name, description, content, ...}]
    │
    ▼
matcher.js: matchSkills(userMessage, skills)
    │
    ├── 方法1：关键词匹配
    │   └── 检查用户消息是否包含 skill 名或 description 中的关键词
    │
    ├── 方法2：Token 相关性评分
    │   └── 对 skill 的 name + description 进行 token 评分
    │
    └── 返回匹配度最高的 skill 列表（按优先级排序）
    │
    ▼
prompts.js: injectSkills(systemPrompt, matchedSkills)
    │
    ├── 将匹配到的 Skill 内容格式化为结构化文本
    └── 追加到系统提示词末尾
    │
    ▼
Agent 循环 → 模型看到 Skill 指令并遵循
```

### 4.2 注入格式

当 Skill 被激活时，其内容会以下列格式注入到系统提示词中：

```
## 激活的技能

### Skill: Code Review
Review source code for bugs, structure, and missing tests.

#### Instructions
1. Read the target files.
2. Search for related code.
3. Focus on bugs, regressions, and missing tests.
4. Keep summaries short and findings concrete.

#### Allowed Tools
Read, Grep, Glob
```

### 4.3 匹配策略细节

**关键词匹配**：

```js
function matchByKeywords(userMessage, skills) {
  const normalizedMsg = userMessage.toLowerCase();
  return skills.filter(skill => {
    const keywords = [
      skill.name.toLowerCase(),
      ...skill.keywords,
    ];
    return keywords.some(kw => normalizedMsg.includes(kw));
  });
}
```

**Token 评分匹配**（更精确）：

```js
function scoreSkillRelevance(userMessage, skill) {
  const msgTokens = tokenize(userMessage);
  const skillTokens = tokenize(skill.name + ' ' + skill.description);
  const intersection = msgTokens.filter(t => skillTokens.includes(t));
  return intersection.length / Math.max(msgTokens.length, 1);
}
```

---

## 5. 权限系统

### 5.1 allowed-tools 白名单

当 Skill 声明了 `allowed-tools` 时，只有列表中的工具可以被此 Skill 使用：

```yaml
allowed-tools: Read, Grep, Glob
```

这意味着当此 Skill 激活时，Agent 不能使用 `write_file`、`bash` 等写入工具。

### 5.2 blocked-tools 黑名单

```yaml
blocked-tools: bash, write_file
```

明确禁止某些工具，即使其他配置允许。

### 5.3 权限校验证实

在 `tools.js` 中实现权限检查：

```js
function checkToolPermission(name, activeSkills, allowedTools, blockedTools) {
  // 全局黑名单检查
  if (blockedTools?.includes(name)) {
    throw new Error(`工具 "${name}" 已被禁止`);
  }

  // Skill 权限检查
  for (const skill of activeSkills) {
    if (skill.allowedTools && !skill.allowedTools.includes(name)) {
      throw new Error(`Skill "${skill.name}" 不允许使用工具 "${name}"`);
    }
  }
}
```

---

## 6. 完整示例

### 6.1 Python 测试编写 Skill

```markdown
---
name: Python Testing
description: Write and maintain Python tests using pytest. Activate when user mentions testing, pytest, or test coverage.
allowed-tools: Read, Grep, Glob, Write
priority: high
---

# Python Testing

## Instructions

1. Always use pytest for Python testing.
2. Test files should be placed in `tests/` directory.
3. Follow the naming convention: `test_<module_name>.py`.
4. One test function per scenario.
5. Use fixtures for shared resources.
6. Aim for >80% code coverage.

## Test Structure

```python
import pytest
from mymodule import my_function

def test_basic_functionality():
    result = my_function(input_data)
    assert result == expected_output

def test_edge_case():
    result = my_function(edge_input)
    assert result == expected_edge_output
```

## Rules

- Do not use unittest module.
- Mock external APIs in tests.
- Keep tests independent of each other.
```

### 6.2 React 最佳实践 Skill

```markdown
---
name: React Best Practices
description: Guidance for writing clean, performant React components. Use when working with React/JSX files.
allowed-tools: Read, Grep, Glob, Write, Edit
triggers:
  - pattern: "*.jsx"
  - pattern: "*.tsx"
---

# React Best Practices

## Instructions

1. Use functional components with hooks.
2. Keep components small and focused (Single Responsibility).
3. Extract reusable logic into custom hooks.
4. Use TypeScript for type safety.
5. Follow the naming convention: PascalCase for components.

## State Management

- Use `useState` for local component state.
- Use `useReducer` for complex state logic.
- Use React Context for shared state (avoid prop drilling).
- Consider Zustand or Jotai for global state.

## Performance

- Use `React.memo` for expensive renders.
- Use `useMemo` and `useCallback` judiciously.
- Lazy load routes with `React.lazy`.
- Avoid inline functions in JSX props.

## Rules

- No class components in new code.
- Export components as default exports.
- Keep effects clean with proper cleanup functions.
```

### 6.3 安全审计 Skill

```markdown
---
name: Security Audit
description: Audit code for common security vulnerabilities. Use when user asks about security, vulnerabilities, or penetration testing.
allowed-tools: Read, Grep, Glob
blocked-tools: bash
priority: high
---

# Security Audit

## Instructions

1. Check for SQL injection vulnerabilities (raw query strings).
2. Check for XSS vulnerabilities (unsafe innerHTML, dangerouslySetInnerHTML).
3. Check for insecure deserialization.
4. Check for hardcoded secrets and credentials.
5. Check for outdated dependencies with known CVEs.

## Checklist

- [ ] SQL injection (parameterized queries?)
- [ ] XSS (output encoding?)
- [ ] CSRF (tokens present?)
- [ ] Authentication (proper session management?)
- [ ] Authorization (access control checks?)
- [ ] Data validation (input sanitization?)
- [ ] Secure communication (HTTPS/TLS?)
- [ ] Error handling (information leakage?)

## Output Format

Provide findings in this format:
- **Severity**: Critical/High/Medium/Low
- **Location**: file:line
- **Issue**: description
- **Fix**: recommended remediation
```

---

## 7. 命令行操作

### 7.1 查看所有 Skill

```bash
frees-agent skills
```

列出当前工作区可用的所有 Skill，显示名称、描述和路径。

### 7.2 查看特定 Skill

```bash
frees-agent skills code-review
```

显示指定 Skill 的详细内容。

### 7.3 从工作区查看

```bash
frees-agent skills code-review --workspace /path/to/project
```

指定从某个工作区加载 Skill。

### 7.4 聊天中的 Skill 命令

在聊天模式中，可以通过以下命令查看和管理 Skill：

```
/skills          → 列出所有可用 Skill
/skills <name>   → 查看特定 Skill
```

---

## 8. 最佳实践

### 8.1 设计原则

1. **单一职责**：一个 Skill 只做一件事
   - 好：`Python Testing`（专注 pytest 测试）
   - 不好：`Python Development`（测试/部署/风格检查混在一起）

2. **清晰的触发场景**：`description` 要写清楚何时触发
   - 好："Use when reviewing code, PRs, or file changes."
   - 不好："For code review."

3. **具体的指令**：命令要可操作
   - 好："1. Read the target files. 2. Search for related code."
   - 不好："Review the code carefully."

4. **合理的权限约束**
   - 只读 Skill 明确限制 `allowed-tools` 为只读工具
   - 需要写入的 Skill 必须明确声明

### 8.2 编写清单

- [ ] `name` 是否明确表达了 Skill 的领域？
- [ ] `description` 是否包含了触发关键词？
- [ ] 指令步骤是否可操作、具体？
- [ ] `allowed-tools` 是否合理限制了工具范围？
- [ ] 是否包含了输出格式要求？
- [ ] 是否避免了与其他 Skill 的冲突？

### 8.3 常见问题

**Q: Skill 没有被自动匹配？**
A: 检查 `description` 是否包含用户消息中的关键词。匹配算法基于文本相似度。

**Q: Skill 匹配了错误的场景？**
A: 缩小 `description` 的范围，增加更具体的触发条件描述。

**Q: 多个 Skill 同时匹配会怎样？**
A: 所有匹配的 Skill 都会被注入。如果指令冲突，模型会自行判断优先级。

**Q: 如何调试 Skill 匹配？**
A: 使用 `frees-agent skills` 查看所有可用 Skill，检查是否正确扫描到。

---

## 9. 扩展指南

### 9.1 可扩展的方向

当前 Skill 系统已经支持基础功能，以下方向可以继续增强：

| 功能 | 当前状态 | 扩展方式 |
|------|----------|----------|
| Frontmatter 解析 | ✅ 基础字段 | 增加新的元数据字段 |
| allowed-tools 校验 | ⚠️ 描述性 | 在 tools.js 中实现强制校验 |
| Skill 依赖 | ❌ 未实现 | 实现依赖加载和顺序执行 |
| Skill 自动触发 | ⚠️ 基础关键词 | 实现文件模式匹配和事件触发 |
| Skill 优先级 | ✅ 已支持 | 完善排序算法 |
| Skill 命名空间 | ❌ 未实现 | 支持 Skill 分组 |
| Skill 测试 | ❌ 未实现 | 为 Skill 添加单元测试 |
| Skill 版本管理 | ❌ 未实现 | 支持版本号和更新检测 |

### 9.2 关键文件

| 文件 | 职责 |
|------|------|
| `src/skills/loader.js` | Skill 文件扫描、解析和格式化 |
| `src/commands/skills.js` | `frees-agent skills` 命令实现 |
| `src/agent/tools.js` | 工具权限校验（集成点） |
| `src/agent/prompts.js` | Skill 注入到提示词（集成点） |

### 9.3 实现 Skill 依赖加载

```js
// 扩展 loader.js 实现依赖解析
async function loadSkillsWithDependencies(skillName, allSkills) {
  const skill = allSkills.find(s => s.name === skillName);
  if (!skill) return [];

  const loaded = new Set();
  const queue = [skill];

  while (queue.length > 0) {
    const current = queue.shift();
    if (loaded.has(current.name)) continue;
    loaded.add(current.name);

    if (current.dependsOn) {
      for (const depName of current.dependsOn) {
        const dep = allSkills.find(s => s.name === depName);
        if (dep) queue.push(dep);
      }
    }
  }

  return Array.from(loaded).map(name =>
    allSkills.find(s => s.name === name)
  );
}
```

---

## 10. 与 Claude Code 的差异

Frees Agent 的 Skill 系统与 Claude Code 的 Agent Skills 兼容，但有额外增强：

| 特性 | Frees Agent | Claude Code |
|------|-------------|-------------|
| 目录层次 | 3 层（~/.claude/ + .claude/ + .frees-agent/） | 2 层 |
| 权限校验 | allowed-tools + blocked-tools | allowed-tools |
| 优先级 | 支持 priority 字段 | 无 |
| 依赖管理 | 支持 depends-on | 无 |
| 触发的条件 | 关键词 + Token 评分 | 自动 |
| 查看命令 | `frees-agent skills` | `/skills` |

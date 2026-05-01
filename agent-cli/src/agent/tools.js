import {
  createWorkspaceDirectory,
  deleteWorkspaceFile,
  listFiles,
  readIndexedFile,
  replaceInWorkspaceFile,
  searchText,
  writeWorkspaceFile
} from '../workspace/queries.js';
import { searchWebWithTavily } from '../tools/web-search.js';
import { fetchUrl, htmlToBasicText } from '../tools/web-fetch.js';
import { execShell, validateShellCommand } from '../shell/shell-exec.js';
import { buildMcpToolHandlers } from '../tools/mcp-client.js';
import {
  gitStatus, gitDiff, gitCommit, gitLog, gitBranch, gitCheckout, gitAdd, getGitToolList
} from '../tools/git.js';
import { searchAndReplace } from '../tools/search-replace.js';
import {
  imageInfo, imageConvert, imageResize, imageFilter, imageCompress, imageWatermark,
  videoInfo, videoTrim, videoConcat, videoConvert, videoExtractAudio, videoCompress,
  videoAddSubtitles, videoSpeed, videoTransition, videoTextOverlay, videoFromImages, videoChromaKey,
  audioInfo, audioConvert, audioTrim, audioConcat, audioMix, audioVolume,
  audioNoiseReduce, audioSpeed, audioExtractSegment, getMediaToolList,
} from '../tools/media.js';

export function createAgentToolbox(index, {
  dryRun = false, readOnly = false, config = {},
  allowedTools = null, blockedTools = null,
} = {}) {
  const changes = [];
  let mcpHandlers = null;

  function checkToolPermission(name) {
    if (allowedTools && Array.isArray(allowedTools) && allowedTools.length > 0) {
      if (!allowedTools.includes(name)) {
        throw new Error(`工具 "${name}" 未被当前技能允许。允许的工具: ${allowedTools.join(', ')}`);
      }
    }
    if (blockedTools && Array.isArray(blockedTools) && blockedTools.length > 0) {
      if (blockedTools.includes(name)) {
        throw new Error(`工具 "${name}" 已被当前技能禁止使用。`);
      }
    }
  }

  function setMcpManager(mcpManager) {
    if (mcpManager) {
      mcpHandlers = buildMcpToolHandlers(mcpManager);
    }
  }

  async function runTool(name, args = {}) {
    // Check tool permissions
    checkToolPermission(name);

    // Try MCP tools first if available
    if (mcpHandlers) {
      const mcpResult = await mcpHandlers.tryHandleMcpTool(name, args);
      if (mcpResult !== null) return mcpResult;
    }

    switch (name) {
      // ---- Read operations ----
      case 'list_files':
      case 'glob': {
        return { ok: true, data: listFiles(index, args) };
      }

      case 'search_text':
      case 'grep': {
        return { ok: true, data: searchText(index, args) };
      }

      case 'read_file':
      case 'read': {
        return { ok: true, data: readIndexedFile(index, args.path, args) };
      }

      // ---- Write operations ----
      case 'mkdir': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 mkdir。');
        if (dryRun) {
          changes.push({ type: 'mkdir', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true } };
        }
        const data = await createWorkspaceDirectory(index, args.path);
        changes.push({ type: 'mkdir', path: args.path });
        return { ok: true, data };
      }

      case 'write_file':
      case 'write': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 write_file。');
        if (dryRun) {
          changes.push({ type: 'write', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true, bytes: Buffer.byteLength(args.content || '', 'utf8') } };
        }
        const data = await writeWorkspaceFile(index, args.path, args.content || '');
        changes.push({ type: 'write', path: args.path });
        return { ok: true, data };
      }

      case 'replace_in_file':
      case 'edit': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 replace_in_file。');
        if (dryRun) {
          changes.push({ type: 'replace', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true, replaceAll: Boolean(args.replaceAll) } };
        }
        const data = await replaceInWorkspaceFile(index, args.path, args.oldText, args.newText, Boolean(args.replaceAll));
        changes.push({ type: 'replace', path: args.path });
        return { ok: true, data };
      }

      case 'delete_file': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 delete_file。');
        if (dryRun) {
          changes.push({ type: 'delete', path: args.path, dryRun: true });
          return { ok: true, data: { path: args.path, dryRun: true } };
        }
        const data = await deleteWorkspaceFile(index, args.path);
        changes.push({ type: 'delete', path: args.path });
        return { ok: true, data };
      }

      // ---- Web operations ----
      case 'web_search': {
        const query = String(args.query || '').trim();
        if (!query) throw new Error('web_search 需要 query');
        const data = await searchWebWithTavily(query, config, { maxResults: args.maxResults });
        return { ok: true, data };
      }

      case 'web_fetch':
      case 'fetch': {
        const url = String(args.url || '').trim();
        if (!url) throw new Error('web_fetch 需要 url');
        const result = await fetchUrl(url, { timeoutMs: args.timeoutMs });
        // Convert HTML to readable text if it's HTML
        if (result.contentType.includes('text/html')) {
          result.content = htmlToBasicText(result.content);
        }
        return { ok: true, data: result };
      }

      // ---- Shell operations ----
      case 'bash':
      case 'shell':
      case 'execute_command': {
        const command = String(args.command || '').trim();
        if (!command) return { ok: false, error: 'bash 需要 command' };

        const validation = validateShellCommand(command);
        if (!validation.safe) {
          return { ok: false, error: `命令安全检查未通过: ${validation.reason}` };
        }

        const result = await execShell(command, {
          cwd: args.cwd,
          timeoutMs: args.timeoutMs,
          mergeStderr: args.mergeStderr,
        });

        return {
          ok: result.code === 0,
          data: {
            stdout: result.stdout,
            stderr: result.stderr,
            code: result.code,
            timedOut: result.timedOut,
            truncated: result.truncated,
            duration: result.duration,
          }
        };
      }

      // ---- MCP tools ----
      case 'list_mcp_tools': {
        if (!mcpHandlers) return { ok: true, data: { tools: [] } };
        return { ok: true, data: { tools: mcpHandlers.getToolSchemas() } };
      }

      // ---- Git operations ----
      case 'git_status': return gitStatus({ cwd: args.cwd });
      case 'git_diff': return gitDiff({ staged: args.staged, path: args.path, contextLines: args.contextLines, cwd: args.cwd });
      case 'git_commit': return gitCommit({ message: args.message, cwd: args.cwd });
      case 'git_log': return gitLog({ maxCount: args.maxCount, path: args.path, branch: args.branch, cwd: args.cwd });
      case 'git_branch': return gitBranch({ cwd: args.cwd });
      case 'git_checkout': return gitCheckout({ branch: args.branch, target: args.target, cwd: args.cwd });
      case 'git_add': return gitAdd({ files: args.files, cwd: args.cwd });

      // ---- Context-aware search & replace ----
      case 'search_and_replace':
      case 'smart_edit': {
        if (readOnly) throw new Error('当前工具箱为只读模式，禁止 search_and_replace。');
        if (dryRun) {
          changes.push({ type: 'search_and_replace', path: args.filePath, dryRun: true });
          return { ok: true, data: { path: args.filePath, dryRun: true } };
        }
        const sResult = searchAndReplace({
          filePath: args.filePath || args.path,
          oldText: args.oldText || args.old,
          newText: args.newText || args.new,
          contextLines: args.contextLines,
          startLine: args.startLine,
          regex: Boolean(args.regex),
          replaceAll: Boolean(args.replaceAll),
        });
        if (sResult.ok) {
          changes.push({ type: 'search_and_replace', path: args.filePath || args.path });
        }
        return sResult;
      }

      // ---- System info ----
      case 'system_info': {
        const { getSystemInfo } = await import('../utils/system-info.js');
        return { ok: true, data: getSystemInfo() };
      }

      // ---- Image Processing ----
      case 'image_info': return imageInfo({ path: args.path });
      case 'image_convert': return imageConvert({ input: args.input || args.path, output: args.output, quality: args.quality });
      case 'image_resize': return imageResize({ path: args.path, width: args.width, height: args.height, mode: args.mode || 'resize', output: args.output });
      case 'image_filter': return imageFilter({ path: args.path, filter: args.filter, intensity: args.intensity, output: args.output });
      case 'image_compress': return imageCompress({ path: args.path, quality: args.quality, maxWidth: args.maxWidth, output: args.output });
      case 'image_watermark': return imageWatermark({ path: args.path, watermark: args.watermark, position: args.position, opacity: args.opacity, output: args.output });

      // ---- Video Processing ----
      case 'video_info': return videoInfo({ path: args.path });
      case 'video_trim': return videoTrim({ path: args.path, start: args.start, duration: args.duration, end: args.end, output: args.output });
      case 'video_concat': return videoConcat({ files: args.files, output: args.output });
      case 'video_convert': return videoConvert({ input: args.input || args.path, output: args.output, codec: args.codec, quality: args.quality });
      case 'video_extract_audio': return videoExtractAudio({ path: args.path, format: args.format, output: args.output });
      case 'video_compress': return videoCompress({ path: args.path, crf: args.crf, preset: args.preset, resolution: args.resolution, output: args.output });
      case 'video_add_subtitles': return videoAddSubtitles({ path: args.path, subtitles: args.subtitles, output: args.output });
      case 'video_speed': return videoSpeed({ path: args.path, speed: args.speed, output: args.output });

      // ---- Advanced Video Editing ----
      case 'video_transition': return videoTransition({ path: args.path, transition: args.transition, duration: args.duration, output: args.output });
      case 'video_text_overlay': return videoTextOverlay({ path: args.path, text: args.text, position: args.position, fontSize: args.fontSize, color: args.color, output: args.output });
      case 'video_from_images': return videoFromImages({ images: args.images, fps: args.fps, output: args.output });
      case 'video_chroma_key': return videoChromaKey({ path: args.path, color: args.color, similarity: args.similarity, output: args.output });

      // ---- Audio Processing ----
      case 'audio_info': return audioInfo({ path: args.path });
      case 'audio_convert': return audioConvert({ input: args.input || args.path, output: args.output, sampleRate: args.sampleRate, channels: args.channels });
      case 'audio_trim': return audioTrim({ path: args.path, start: args.start, duration: args.duration, end: args.end, output: args.output });
      case 'audio_concat': return audioConcat({ files: args.files, output: args.output });
      case 'audio_mix': return audioMix({ tracks: args.tracks, output: args.output });
      case 'audio_volume': return audioVolume({ path: args.path, volume: args.volume, output: args.output });
      case 'audio_noise_reduce': return audioNoiseReduce({ path: args.path, strength: args.strength, output: args.output });
      case 'audio_speed': return audioSpeed({ path: args.path, speed: args.speed, output: args.output });
      case 'audio_extract_segment': return audioExtractSegment({ path: args.path, start: args.start, duration: args.duration, output: args.output });

      default:
        throw new Error(
          `未知工具: ${name}。可用工具: read_file, search_text, list_files, write_file, replace_in_file, mkdir, delete_file, web_search, web_fetch, bash${mcpHandlers ? ', ' + mcpHandlers.getToolNames().join(', ') : ''}`
        );
    }
  }

  function getToolList() {
    const tools = [
      { name: 'read_file', description: 'Read file with line numbers' },
      { name: 'search_text', description: 'Search text in workspace' },
      { name: 'list_files', description: 'List workspace files with glob' },
      { name: 'write_file', description: 'Write content to file' },
      { name: 'replace_in_file', description: 'Replace text in file (legacy, use search_and_replace for new code)' },
      { name: 'search_and_replace', description: 'Context-aware search & replace with fallback strategies (exact/context/line/normalized). Supports regex mode. More robust than replace_in_file.' },
      { name: 'delete_file', description: 'Delete a file' },
      { name: 'mkdir', description: 'Create a directory' },
      { name: 'web_search', description: 'Search the web via Tavily' },
      { name: 'web_fetch', description: 'Fetch a URL and get content' },
      { name: 'bash', description: 'Execute a shell command' },
      { name: 'system_info', description: 'Get current system time, date, platform, and OS info' },
      // Git tools
      ...getGitToolList(),
      // Media tools
      ...getMediaToolList(),
    ];
    if (mcpHandlers) {
      for (const t of mcpHandlers.getToolSchemas()) {
        tools.push({ name: t.name, description: t.description || 'MCP tool' });
      }
    }
    return tools;
  }

  return {
    changes,
    runTool,
    setMcpManager,
    getToolList,
    mcpHandlers
  };
}

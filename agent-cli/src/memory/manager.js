import { extractFirstJsonObject, truncateForModel } from '../utils/json.js';
import { inferLocalMemory } from './heuristics.js';
import {
  appendTurnToSession,
  getRecentMessagesForModel,
  mergeMemoryExtraction,
  saveMemoryState
} from './store.js';
import {
  buildMemoryContext,
  buildMemoryExtractionPrompt,
  buildSummaryPrompt,
  MEMORY_EXTRACT_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT
} from './prompts.js';

function normalizeSummaryPayload(payload) {
  if (!payload) {
    return '';
  }
  if (typeof payload.summary === 'string' && payload.summary.trim()) {
    const parts = [payload.summary.trim()];
    if (Array.isArray(payload.keyFacts) && payload.keyFacts.length) {
      parts.push(`关键事实:\n- ${payload.keyFacts.join('\n- ')}`);
    }
    if (Array.isArray(payload.openLoops) && payload.openLoops.length) {
      parts.push(`待继续事项:\n- ${payload.openLoops.join('\n- ')}`);
    }
    return parts.join('\n\n');
  }
  return '';
}

export function buildChatSystemPrompt({ baseSystemPrompt, state, config }) {
  const memoryEnabled = config?.memory?.enabled !== false;
  if (!memoryEnabled) {
    return baseSystemPrompt;
  }

  const memoryContext = buildMemoryContext({
    profile: config?.memory?.includeUserProfile === false ? {} : state.profile,
    durableMemories:
      config?.memory?.includeDurableMemories === false ? [] : state.durableMemories,
    sessionSummary: state.session.summary
  });

  if (!memoryContext) {
    return baseSystemPrompt;
  }

  return `${baseSystemPrompt}\n\n${memoryContext}`.trim();
}

export async function updateMemoryAfterTurn({
  client,
  state,
  userMessage,
  assistantMessage,
  config,
  temperature = 0
}) {
  appendTurnToSession(state, userMessage, assistantMessage);
  mergeMemoryExtraction(state, inferLocalMemory(userMessage), config);

  if (config?.memory?.enabled === false || config?.memory?.autoExtract === false) {
    await saveMemoryState(state);
    return;
  }

  try {
    const raw = await client.generateText({
      systemPrompt: MEMORY_EXTRACT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildMemoryExtractionPrompt({
            profile: state.profile,
            durableMemories: state.durableMemories,
            userMessage,
            assistantMessage
          })
        }
      ],
      temperature,
      maxOutputTokens: 1200
    });
    const extraction = extractFirstJsonObject(raw);
    mergeMemoryExtraction(state, extraction, config);
  } catch {
    // Ignore extraction failures to avoid breaking the main chat loop.
  }

  await saveMemoryState(state);
}

export async function compactConversationIfNeeded({
  client,
  state,
  config,
  temperature = 0.1
}) {
  const threshold = config?.conversation?.summarizeAfterMessages ?? 18;
  const keepRecentMessages = config?.conversation?.keepRecentMessages ?? 12;

  if ((state.session.recentMessages || []).length <= threshold) {
    return;
  }

  const messages = state.session.recentMessages;
  const splitIndex = Math.max(2, messages.length - keepRecentMessages);
  const olderMessages = messages.slice(0, splitIndex);
  const keptMessages = messages.slice(splitIndex);

  try {
    const raw = await client.generateText({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildSummaryPrompt({
            existingSummary: state.session.summary,
            messagesToSummarize: olderMessages
          })
        }
      ],
      temperature,
      maxOutputTokens: 1800
    });
    const payload = extractFirstJsonObject(raw);
    const nextSummary = normalizeSummaryPayload(payload) || truncateForModel(raw, 4000);
    state.session.summary = truncateForModel(
      nextSummary,
      config?.conversation?.maxSummaryChars ?? 6000
    );
    state.session.recentMessages = keptMessages;
  } catch {
    const fallback = olderMessages
      .map(message => `${message.role}: ${truncateForModel(message.content, 300)}`)
      .join('\n');
    state.session.summary = truncateForModel(
      [state.session.summary, fallback].filter(Boolean).join('\n\n'),
      config?.conversation?.maxSummaryChars ?? 6000
    );
    state.session.recentMessages = keptMessages;
  }

  await saveMemoryState(state);
}

export function describeMemoryState(state) {
  return {
    storage: {
      storageRoot: state.store.storageRoot,
      profilePath: state.store.profilePath,
      durableMemoryPath: state.store.durableMemoryPath,
      sessionPath: state.store.sessionPath
    },
    profile: state.profile,
    durableMemories: state.durableMemories,
    session: {
      id: state.session.id,
      name: state.session.name,
      totalTurns: state.session.totalTurns,
      summary: state.session.summary,
      recentMessages: getRecentMessagesForModel(state)
    }
  };
}

import { extractFirstJsonObject, truncateForModel } from '../utils/json.js';
import { estimateMessagesTokens } from '../utils/tokens.js';
import { inferLocalMemory } from './heuristics.js';
import { extractProfileFromText, mergeMemoryExtractions } from './ingest.js';
import { inferTasksFromMessage, mergeTasks, saveTaskMemory } from './tasks.js';
import {
  appendTurnToSession,
  getRecentMessagesForModel,
  mergeMemoryExtraction,
  saveMemoryState,
  saveSessionToFile,
  autoNameSession,
  listAllSessionFiles
} from './store.js';
import { queryVectorMemories, upsertDurableMemoriesToVectorIndex } from './vector.js';
import { injectSystemClock } from '../utils/system-info.js';
import {
  buildMemoryContext,
  buildMemoryExtractionPrompt,
  buildSummaryPrompt,
  MEMORY_EXTRACT_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT
} from './prompts.js';

function normalizeSummaryPayload(payload) {
  if (!payload) return '';
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
  if (!memoryEnabled) return baseSystemPrompt;

  const memoryContext = buildMemoryContext({
    profile: config?.memory?.includeUserProfile === false ? {} : state.profile,
    durableMemories:
      config?.memory?.includeDurableMemories === false ? [] : state.durableMemories,
    sessionSummary: state.session.summary,
    semanticMemories: state.semanticMemories || [],
    tasks: state.tasks || []
  });

  if (!memoryContext) return injectSystemClock(baseSystemPrompt);

  return injectSystemClock(`${baseSystemPrompt}\n${memoryContext}`.trim());
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

  // Local heuristic extraction (zero token cost)
  mergeMemoryExtraction(
    state,
    mergeMemoryExtractions(
      inferLocalMemory(userMessage),
      { profilePatch: extractProfileFromText(userMessage) }
    ),
    config
  );
  state.tasks = mergeTasks(state.tasks || [], inferTasksFromMessage(userMessage));

  if (config?.memory?.enabled === false || config?.memory?.autoExtract === false) {
    await saveTaskMemory(state.store.taskMemoryPath, state.tasks || []);
    await saveMemoryState(state);
    return;
  }

  // LLM-assisted extraction (spent tokens, high value)
  try {
    const raw = await client.generateText({
      systemPrompt: MEMORY_EXTRACT_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildMemoryExtractionPrompt({
          profile: state.profile,
          durableMemories: state.durableMemories,
          userMessage,
          assistantMessage
        })
      }],
      temperature,
      maxOutputTokens: 1200
    });
    const extraction = extractFirstJsonObject(raw);
    mergeMemoryExtraction(state, mergeMemoryExtractions(extraction), config);
  } catch {
    // Extraction failures don't break the main loop
  }

  // Vector index is optional; skip if no durable memories
  if (config?.memory?.vectorMemory?.enabled !== false && state.durableMemories.length > 0) {
    await upsertDurableMemoriesToVectorIndex(
      state.store.vectorMemoryPath,
      state.durableMemories
    );
  }

  await saveTaskMemory(state.store.taskMemoryPath, state.tasks || []);
  await saveMemoryState(state);
  await saveSessionToFile(state);
}

export async function attachSemanticMemoriesToState({ state, query, config }) {
  if (config?.memory?.vectorMemory?.enabled === false) {
    state.semanticMemories = [];
    return;
  }
  if (!query || !state.durableMemories.length) {
    state.semanticMemories = [];
    return;
  }
  state.semanticMemories = await queryVectorMemories(
    state.store.vectorMemoryPath,
    query,
    config?.memory?.vectorMemory?.topK ?? 6
  );
}

export async function compactConversationIfNeeded({ client, state, config, temperature = 0.1 }) {
  const threshold = config?.conversation?.summarizeAfterMessages ?? 18;
  const keepRecentMessages = config?.conversation?.keepRecentMessages ?? 12;
  const tokenThreshold = config?.conversation?.maxRecentContextTokens ?? 12000;
  const recentTokenEstimate = estimateMessagesTokens(state.session.recentMessages || []);

  if (
    (state.session.recentMessages || []).length <= threshold &&
    recentTokenEstimate <= tokenThreshold
  ) {
    return;
  }

  const messages = state.session.recentMessages;
  const splitIndex = Math.max(2, messages.length - keepRecentMessages);
  const olderMessages = messages.slice(0, splitIndex);
  const keptMessages = messages.slice(splitIndex);

  try {
    const raw = await client.generateText({
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildSummaryPrompt({
          existingSummary: state.session.summary,
          messagesToSummarize: olderMessages
        })
      }],
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
      .map(m => `${m.role}: ${truncateForModel(m.content, 300)}`)
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
    storage: { storageRoot: state.store.storageRoot },
    profile: state.profile,
    durableMemories: state.durableMemories,
    session: {
      id: state.session.id,
      name: state.session.name,
      totalTurns: state.session.totalTurns,
      summary: state.session.summary,
      recentMessages: getRecentMessagesForModel(state)
    },
    semanticMemories: state.semanticMemories || [],
    tasks: state.tasks || []
  };
}

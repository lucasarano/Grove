/**
 * Model appends this block at the end of assistant replies (see claude.js system prompt).
 * Parsed on completion; stripped from chat display.
 */
export const TOPIC_START = '<<<GROVE_TOPIC>>>';
export const TOPIC_END = '<<<END_GROVE_TOPIC>>>';

const COMPLETE_BLOCK = new RegExp(
  `${escapeRe(TOPIC_START)}([\\s\\S]*?)${escapeRe(TOPIC_END)}\\s*$`,
);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Max chars for tree card topic line */
const TOPIC_MAX = 72;

/**
 * Split stored assistant content into visible body + topic label for the tree.
 */
export function splitTopicFromContent(raw) {
  if (!raw || typeof raw !== 'string') {
    return { content: '', topicLabel: null };
  }
  const m = raw.match(COMPLETE_BLOCK);
  if (!m) {
    return { content: raw.trimEnd(), topicLabel: null };
  }
  const topicLabel = m[1].replace(/\s+/g, ' ').trim().slice(0, TOPIC_MAX);
  const content = raw.slice(0, m.index).trimEnd();
  return { content, topicLabel: topicLabel || null };
}

/**
 * Hide topic block while streaming (may be incomplete).
 */
export function stripTopicBlockForDisplay(text) {
  if (!text) return '';
  let s = text;
  const complete = s.match(COMPLETE_BLOCK);
  if (complete) {
    s = s.slice(0, complete.index).trimEnd();
  }
  const start = s.lastIndexOf(TOPIC_START);
  if (start !== -1) {
    s = s.slice(0, start).trimEnd();
  }
  return s;
}

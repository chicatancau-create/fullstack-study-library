export function dedupeByMessageId(messages) {
  const seen = new Set();
  return messages.filter((m) => {
    if (seen.has(m.messageId)) return false;
    seen.add(m.messageId);
    return true;
  });
}

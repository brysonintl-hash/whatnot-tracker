export interface ChatMessage {
  id: string;
  username: string;
  name: string;
  role: string;
  text: string;
  at: number;
}

const messages: ChatMessage[] = [];
const MAX = 100;

export function addMessage(msg: Omit<ChatMessage, 'id' | 'at'>): ChatMessage {
  const m: ChatMessage = { ...msg, id: Math.random().toString(36).slice(2), at: Date.now() };
  messages.push(m);
  if (messages.length > MAX) messages.splice(0, messages.length - MAX);
  return m;
}

export function getMessages(since = 0): ChatMessage[] {
  return messages.filter(m => m.at > since);
}

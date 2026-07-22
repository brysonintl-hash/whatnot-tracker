import { readData, writeData } from './storage';

const FILE = 'gmail-filters.json';
const DEFAULT = ['support@whatnot.zendesk.com'];

export function getGmailFilters(): string[] {
  const saved = readData<string[]>(FILE, DEFAULT);
  return saved.length ? saved : DEFAULT;
}

export function setGmailFilters(emails: string[]): string[] {
  const cleaned = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
  writeData(FILE, cleaned);
  return cleaned;
}

export function buildGmailQuery(emails: string[]): string {
  if (emails.length === 1) return `from:${emails[0]}`;
  return `from:(${emails.join(' OR ')})`;
}

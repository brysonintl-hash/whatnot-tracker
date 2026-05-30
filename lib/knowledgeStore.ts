import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type KnowledgeLink = {
  id: string;
  title: string;
  url: string;
  category: string;
  addedBy: string;
  createdAt: string;
};

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'knowledge.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function getLinks(): KnowledgeLink[] {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {}
  return [];
}

export function addLink(data: Omit<KnowledgeLink, 'id' | 'createdAt'>): KnowledgeLink {
  const links = getLinks();
  const link: KnowledgeLink = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
  ensureDir();
  writeFileSync(FILE, JSON.stringify([...links, link], null, 2));
  return link;
}

export function deleteLink(id: string): boolean {
  const links = getLinks();
  const filtered = links.filter(l => l.id !== id);
  if (filtered.length === links.length) return false;
  ensureDir();
  writeFileSync(FILE, JSON.stringify(filtered, null, 2));
  return true;
}

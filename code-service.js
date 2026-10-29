/**
 * SmartAssist AI — Code Assistant Service
 * Handles persistence for coding sessions, history tracking,
 * and Supabase synchronization with Row Level Security.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'code_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class CodeStore {
  constructor() {
    this.sessions = new Map(); // id -> sessionObject
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          for (const [id, session] of Object.entries(data)) {
            this.sessions.set(id, session);
          }
        }
      }
    } catch (err) {
      console.warn('[CodeStore] Warning: Could not load code_store.json:', err.message);
    }
  }

  saveToDisk() {
    try {
      const data = {};
      for (const [id, session] of this.sessions.entries()) {
        data[id] = session;
      }
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[CodeStore] Failed to write code_store.json:', err.message);
    }
  }

  getSessions(userId) {
    const results = [];
    for (const session of this.sessions.values()) {
      if (!session.userId || session.userId === userId || userId === 'guest_user') {
        results.push(session);
      }
    }
    return results.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }

  getSession(id, userId) {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.userId && session.userId !== userId && userId !== 'guest_user') {
      return null; // unauthorized access attempt
    }
    return session;
  }

  saveSession(session) {
    session.updatedAt = new Date().toISOString();
    if (!session.createdAt) {
      session.createdAt = session.updatedAt;
    }
    this.sessions.set(session.id, session);
    this.saveToDisk();
    return session;
  }

  deleteSession(id, userId) {
    const session = this.sessions.get(id);
    if (!session) return false;
    if (session.userId && session.userId !== userId && userId !== 'guest_user') {
      return false; // unauthorized access attempt
    }
    this.sessions.delete(id);
    this.saveToDisk();
    return true;
  }
}

export const codeStore = new CodeStore();

/**
 * Sync code session to Supabase if table exists
 */
export async function syncSessionToSupabase(supabase, session) {
  if (!supabase || !session || !session.userId || session.userId === 'guest_user') return;
  try {
    await supabase.from('code_sessions').upsert({
      id: session.id,
      user_id: session.userId,
      title: session.title || 'Untitled Session',
      language: session.language || 'python',
      filename: session.filename || 'main.py',
      code: session.code || '',
      prompt: session.prompt || '',
      mode: session.mode || 'debug',
      result: session.result || {},
      created_at: session.createdAt,
      updated_at: session.updatedAt
    });
  } catch (err) {
    // Gracefully handle missing table or network error
    console.debug('[Supabase Code Sync]: Note: Table code_sessions may not be created yet in Supabase.');
  }
}

/**
 * Delete code session from Supabase
 */
export async function deleteSessionFromSupabase(supabase, id, userId) {
  if (!supabase || !id || !userId || userId === 'guest_user') return;
  try {
    await supabase.from('code_sessions').delete().eq('id', id).eq('user_id', userId);
  } catch (err) {
    console.debug('[Supabase Code Delete]: Note: Table code_sessions deletion skipped.');
  }
}

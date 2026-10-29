/**
 * SmartAssist AI — Multi-Section Recent Chats Test Suite
 * Validates strict separation, persistence, active chat management, and CRUD actions
 * across:
 * 1. Main Chat (general_chat)
 * 2. Study Assistant (study_assistant)
 * 3. Chat with PDF (chat_with_pdf)
 * 4. Code Assistant (code_assistant)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock browser localStorage and window environment
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('  SmartAssist AI — Section-Isolated Recent Chats Test Suite');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${details ? '- ' + details : ''}`);
    }
  }

  // Set up mock window and localStorage
  const mockStorage = new MockLocalStorage();
  global.localStorage = mockStorage;
  global.sessionStorage = new MockLocalStorage();
  global.window = {
    location: { pathname: '/01_main_chat_dashboard/code.html' },
    addEventListener: () => {},
    dispatchEvent: () => {}
  };
  global.document = {
    documentElement: { classList: { add: () => {}, remove: () => {} } },
    body: { classList: { add: () => {}, remove: () => {} } },
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => []
  };

  // Load and evaluate sidebar.js logic
  const sidebarCode = fs.readFileSync(path.join(__dirname, 'sidebar.js'), 'utf8');
  eval(sidebarCode);

  const getCurrentSection = global.window.getCurrentSection;
  const getStoredConversations = global.window.getStoredConversations;
  const saveStoredConversations = global.window.saveStoredConversations;
  const getActiveChatId = global.window.getActiveChatId;
  const setActiveChatId = global.window.setActiveChatId;

  // ---------------------------------------------------------------------------
  // Test 1: Section Detection
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Section Identifier Detection ---');
  global.window.location.pathname = '/01_main_chat_dashboard/code.html';
  assert(getCurrentSection() === 'general_chat', 'Test 1.1: Dashboard detects general_chat');

  global.window.location.pathname = '/02_active_conversation/code.html';
  assert(getCurrentSection() === 'general_chat', 'Test 1.2: Active conversation detects general_chat');

  global.window.location.pathname = '/03_study_assistant/code.html';
  assert(getCurrentSection() === 'study_assistant', 'Test 1.3: Study Assistant detects study_assistant');

  global.window.location.pathname = '/05_chat_with_pdf/code.html';
  assert(getCurrentSection() === 'chat_with_pdf', 'Test 1.4: Chat with PDF detects chat_with_pdf');

  global.window.location.pathname = '/04_code_assistant/code.html';
  assert(getCurrentSection() === 'code_assistant', 'Test 1.5: Code Assistant detects code_assistant');

  // ---------------------------------------------------------------------------
  // Test 2: Safe Migration of Legacy Conversations
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Safe Migration of Legacy Conversations ---');
  const legacyData = [
    { id: 'chat_old_general', title: 'Legacy General Chat', messages: [{ role: 'user', text: 'Hello' }] },
    { id: 'study_algo_1', title: 'Binary Search Notes', studyParams: { subject: 'Algorithms', topic: 'Binary Search' } },
    { id: 'pdf_doc_101', title: 'Resume Review', docId: 'doc_101', filename: 'Resume.pdf' },
    { id: 'code_python_1', title: 'Quicksort Debug', codeParams: { language: 'python' } }
  ];
  mockStorage.setItem('smartassist_conversations', JSON.stringify(legacyData));

  const migrated = getStoredConversations();
  assert(migrated.length === 4, 'Test 2.1: No conversations lost during migration');
  assert(migrated.find(c => c.id === 'chat_old_general').section === 'general_chat', 'Test 2.2: Legacy general chat assigned general_chat');
  assert(migrated.find(c => c.id === 'study_algo_1').section === 'study_assistant', 'Test 2.3: Legacy study chat assigned study_assistant');
  assert(migrated.find(c => c.id === 'pdf_doc_101').section === 'chat_with_pdf', 'Test 2.4: Legacy PDF chat assigned chat_with_pdf');
  assert(migrated.find(c => c.id === 'code_python_1').section === 'code_assistant', 'Test 2.5: Legacy code chat assigned code_assistant');

  // ---------------------------------------------------------------------------
  // Test 3: Strict Section Separation & Filtering
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Strict Section Separation & Filtering ---');
  const allConvs = [
    { id: 'gen_1', section: 'general_chat', title: 'OS Revision', messages: [{ role: 'user', text: 'Threads' }] },
    { id: 'gen_2', section: 'general_chat', title: 'DBMS Norm', messages: [{ role: 'user', text: 'BCNF' }] },
    { id: 'study_1', section: 'study_assistant', title: 'Paging Explanation', studyParams: { subject: 'OS', topic: 'Paging' } },
    { id: 'study_2', section: 'study_assistant', title: 'Knapsack Summary', studyParams: { subject: 'DAA', topic: 'Knapsack' } },
    { id: 'pdf_1', section: 'chat_with_pdf', title: 'Syllabus PDF', docId: 'd1', filename: 'syllabus.pdf' },
    { id: 'pdf_2', section: 'chat_with_pdf', title: 'Lecture 4 PDF', docId: 'd2', filename: 'lecture4.pdf' },
    { id: 'code_1', section: 'code_assistant', title: 'Deadlock Debug', codeParams: { language: 'c' } }
  ];
  saveStoredConversations(allConvs, false);

  const generalList = getStoredConversations().filter(c => (c.section || 'general_chat') === 'general_chat');
  const studyList = getStoredConversations().filter(c => (c.section || 'general_chat') === 'study_assistant');
  const pdfList = getStoredConversations().filter(c => (c.section || 'general_chat') === 'chat_with_pdf');
  const codeList = getStoredConversations().filter(c => (c.section || 'general_chat') === 'code_assistant');

  assert(generalList.length === 2 && generalList.every(c => c.section === 'general_chat'), 'Test 3.1: General list contains only general_chat');
  assert(!generalList.some(c => c.section === 'study_assistant' || c.section === 'chat_with_pdf'), 'Test 3.2: General list never leaks study or PDF chats');

  assert(studyList.length === 2 && studyList.every(c => c.section === 'study_assistant'), 'Test 3.3: Study list contains only study_assistant');
  assert(!studyList.some(c => c.section === 'general_chat' || c.section === 'chat_with_pdf'), 'Test 3.4: Study list never leaks general or PDF chats');

  assert(pdfList.length === 2 && pdfList.every(c => c.section === 'chat_with_pdf'), 'Test 3.5: PDF list contains only chat_with_pdf');
  assert(!pdfList.some(c => c.section === 'general_chat' || c.section === 'study_assistant'), 'Test 3.6: PDF list never leaks general or study chats');

  assert(codeList.length === 1 && codeList[0].section === 'code_assistant', 'Test 3.7: Code list contains only code_assistant');

  // ---------------------------------------------------------------------------
  // Test 4: Independent Active Chat State per Section
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Independent Active Chat State per Section ---');
  setActiveChatId('gen_1', 'general_chat');
  setActiveChatId('study_2', 'study_assistant');
  setActiveChatId('pdf_1', 'chat_with_pdf');
  setActiveChatId('code_1', 'code_assistant');

  assert(getActiveChatId('general_chat') === 'gen_1', 'Test 4.1: general_chat active ID is gen_1');
  assert(getActiveChatId('study_assistant') === 'study_2', 'Test 4.2: study_assistant active ID is study_2');
  assert(getActiveChatId('chat_with_pdf') === 'pdf_1', 'Test 4.3: chat_with_pdf active ID is pdf_1');
  assert(getActiveChatId('code_assistant') === 'code_1', 'Test 4.4: code_assistant active ID is code_1');

  // Updating PDF active chat does not affect general_chat or study_assistant
  setActiveChatId('pdf_2', 'chat_with_pdf');
  assert(getActiveChatId('chat_with_pdf') === 'pdf_2', 'Test 4.5: Updated PDF active chat ID');
  assert(getActiveChatId('general_chat') === 'gen_1', 'Test 4.6: general_chat active chat unchanged');
  assert(getActiveChatId('study_assistant') === 'study_2', 'Test 4.7: study_assistant active chat unchanged');

  // ---------------------------------------------------------------------------
  // Test 5: Section Isolation on New Chat
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: New Chat Section Isolation ---');
  // Add a new chat in general_chat
  const newGeneralId = global.window.startNewConversationId('New Algorithm Query');
  const afterNewGen = getStoredConversations();

  assert(afterNewGen.find(c => c.id === newGeneralId).section === 'general_chat', 'Test 5.1: New general chat has section general_chat');
  assert(getActiveChatId('general_chat') === newGeneralId, 'Test 5.2: general_chat active ID updated to new chat');
  assert(getActiveChatId('study_assistant') === 'study_2', 'Test 5.3: study_assistant active ID remained intact');
  assert(getActiveChatId('chat_with_pdf') === 'pdf_2', 'Test 5.4: chat_with_pdf active ID remained intact');

  // ---------------------------------------------------------------------------
  // Test 6: Rename and Delete Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Rename and Delete Isolation ---');
  // Rename a study chat
  const currentConvs = getStoredConversations();
  const studyTarget = currentConvs.find(c => c.id === 'study_1');
  studyTarget.title = 'Renamed Paging Deep Dive';
  saveStoredConversations(currentConvs, false);

  const verifyRenamed = getStoredConversations().find(c => c.id === 'study_1');
  assert(verifyRenamed.title === 'Renamed Paging Deep Dive', 'Test 6.1: Study chat renamed successfully');
  assert(verifyRenamed.section === 'study_assistant', 'Test 6.2: Study chat section preserved');

  // Delete a general chat
  const remainingAfterDelete = getStoredConversations().filter(c => c.id !== 'gen_2');
  saveStoredConversations(remainingAfterDelete, false);

  const afterDeleteConvs = getStoredConversations();
  assert(!afterDeleteConvs.some(c => c.id === 'gen_2'), 'Test 6.3: Target conversation gen_2 deleted');
  assert(afterDeleteConvs.some(c => c.id === 'study_1'), 'Test 6.4: Study chat preserved');
  assert(afterDeleteConvs.some(c => c.id === 'pdf_1'), 'Test 6.5: PDF chat preserved');

  // ---------------------------------------------------------------------------
  // Test 7: HTTP Server Health & Routes Check
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Server Health & HTML Pages Availability ---');
  try {
    const healthRes = await fetch('http://localhost:3000/api/health');
    assert(healthRes.ok, 'Test 7.1: /api/health responds with 200 OK');

    const pdfDocsRes = await fetch('http://localhost:3000/api/pdf/documents');
    assert(pdfDocsRes.ok, 'Test 7.2: /api/pdf/documents responds with 200 OK');

    const mainChatRes = await fetch('http://localhost:3000/01_main_chat_dashboard/code.html');
    assert(mainChatRes.ok, 'Test 7.3: 01_main_chat_dashboard HTML loads 200 OK');

    const activeChatRes = await fetch('http://localhost:3000/02_active_conversation/code.html');
    assert(activeChatRes.ok, 'Test 7.4: 02_active_conversation HTML loads 200 OK');

    const studyRes = await fetch('http://localhost:3000/03_study_assistant/code.html');
    assert(studyRes.ok, 'Test 7.5: 03_study_assistant HTML loads 200 OK');

    const pdfPageRes = await fetch('http://localhost:3000/05_chat_with_pdf/code.html');
    assert(pdfPageRes.ok, 'Test 7.6: 05_chat_with_pdf HTML loads 200 OK');
  } catch (err) {
    assert(false, 'Test 7: Server endpoint check failed', err.message);
  }

  console.log('\n================================================================');
  console.log(`  Tests Completed: ${passed} / ${total} passed (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

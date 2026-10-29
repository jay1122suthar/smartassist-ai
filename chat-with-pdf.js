/**
 * SmartAssist AI — Dynamic Chat with PDF Engine
 * Complete end-to-end RAG client: PDF upload, drag-and-drop, URL import,
 * document viewing, chapter detection, suggested question chips, grounded Q&A,
 * truthful page citations, and modal management.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Application State
  // ---------------------------------------------------------------------------
  const state = {
    documents: [],
    activeDocId: null,
    activeDoc: null,
    messages: [],
    scopeMin: 1,
    scopeMax: 1000,
    topK: 5,
    isLoading: false,
    isUploading: false,
    isSuggestionsLoading: false,
    currentSuggestionsDocId: null,
    currentUser: null
  };

  // ---------------------------------------------------------------------------
  // 2. DOM Elements Cache
  // ---------------------------------------------------------------------------
  let el = {};

  function cacheDom() {
    el = {
      // Top Ribbon
      chromaChunksBadge: document.getElementById('chroma-chunks-badge'),
      precisionBadge: document.getElementById('precision-badge'),
      indexSettingsBtn: document.getElementById('index-settings-btn'),

      // Upload Hub
      dropZone: document.getElementById('drop-zone'),
      fileUpload: document.getElementById('file-upload'),
      browseFilesBtn: document.getElementById('browse-files-btn'),
      fromUrlBtn: document.getElementById('from-url-btn'),
      uploadProgressContainer: document.getElementById('upload-progress-container'),
      uploadProgressBar: document.getElementById('upload-progress-bar'),
      uploadProgressText: document.getElementById('upload-progress-text'),

      // Active Document Card
      activeDocCard: document.getElementById('active-doc-card'),
      docEmptyState: document.getElementById('doc-empty-state'),
      docFilename: document.getElementById('doc-filename'),
      docMeta: document.getElementById('doc-meta'),
      docStatusBadge: document.getElementById('doc-status-badge'),
      docSyncStatus: document.getElementById('doc-sync-status'),
      docEmbeddingModel: document.getElementById('doc-embedding-model'),
      viewDocBtn: document.getElementById('view-doc-btn'),
      replaceDocBtn: document.getElementById('replace-doc-btn'),
      deleteDocBtn: document.getElementById('delete-doc-btn'),
      downloadDocBtn: document.getElementById('download-doc-btn'),
      replaceFileInput: document.getElementById('replace-file-input'),

      // Table of Contents
      tocContainer: document.getElementById('toc-container'),
      tocCount: document.getElementById('toc-count'),
      tocList: document.getElementById('toc-list'),
      autoQuizBtn: document.getElementById('auto-quiz-btn'),

      // Right Column / Q&A Stream
      suggestedQuestionsContainer: document.getElementById('suggested-questions-container'),
      groundingDocTitle: document.getElementById('grounding-doc-title'),
      messageStream: document.getElementById('message-stream'),
      exportChatBtn: document.getElementById('export-chat-btn'),
      clearChatBtn: document.getElementById('clear-chat-btn'),

      // Input Controls
      queryInput: document.getElementById('query-input'),
      sendBtn: document.getElementById('send-btn'),
      scopeDropdownBtn: document.getElementById('scope-dropdown-btn'),
      scopeDropdownMenu: document.getElementById('scope-dropdown-menu'),
      scopeLabel: document.getElementById('scope-label'),
      topkPill: document.getElementById('topk-pill'),

      // Modals
      urlModal: document.getElementById('url-modal'),
      urlInput: document.getElementById('url-modal-input'),
      urlSubmitBtn: document.getElementById('url-modal-submit'),
      urlCancelBtn: document.getElementById('url-modal-cancel'),
      urlErrorAlert: document.getElementById('url-modal-error'),

      viewModal: document.getElementById('view-modal'),
      viewModalIframe: document.getElementById('view-modal-iframe'),
      viewModalTitle: document.getElementById('view-modal-title'),
      viewModalClose: document.getElementById('view-modal-close'),
      viewModalDownload: document.getElementById('view-modal-download'),
      viewModalNewTab: document.getElementById('view-modal-newtab'),

      settingsModal: document.getElementById('settings-modal'),
      settingChunkSize: document.getElementById('setting-chunk-size'),
      settingChunkOverlap: document.getElementById('setting-chunk-overlap'),
      settingTopK: document.getElementById('setting-top-k'),
      settingsSaveBtn: document.getElementById('settings-save-btn'),
      settingsCancelBtn: document.getElementById('settings-cancel-btn'),

      deleteModal: document.getElementById('delete-modal'),
      deleteDocName: document.getElementById('delete-doc-name'),
      deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
      deleteCancelBtn: document.getElementById('delete-cancel-btn'),

      // Toast notifications container
      toastContainer: document.getElementById('toast-container')
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Auth & Request Helpers
  // ---------------------------------------------------------------------------
  async function getAuthHeaders() {
    const headers = {};
    if (window.SmartAssistAuth) {
      try {
        const client = await window.SmartAssistAuth.getClient();
        if (client) {
          const { data: sessionData } = await client.auth.getSession();
          if (sessionData?.session?.access_token) {
            headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
          }
          if (sessionData?.session?.user?.id) {
            headers['X-User-Id'] = sessionData.session.user.id;
          }
        }
      } catch (e) {}
    }

    try {
      const storedUser = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.id && !headers['X-User-Id']) {
          headers['X-User-Id'] = parsed.id;
        }
      }
    } catch (_) {}

    // Pass guest session ID if stored or fallback
    let guestId = localStorage.getItem('smartassist_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('smartassist_guest_id', guestId);
    }
    headers['X-Guest-Id'] = guestId;

    return headers;
  }

  async function getAuthQueryString() {
    const params = new URLSearchParams();
    if (window.SmartAssistAuth) {
      try {
        const client = await window.SmartAssistAuth.getClient();
        if (client) {
          const { data: sessionData } = await client.auth.getSession();
          if (sessionData?.session?.access_token) {
            params.set('token', sessionData.session.access_token);
          }
          if (sessionData?.session?.user?.id) {
            params.set('userId', sessionData.session.user.id);
          }
        }
      } catch (e) {}
    }

    try {
      const storedUser = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.id && !params.has('userId')) {
          params.set('userId', parsed.id);
        }
      }
    } catch (_) {}

    const guestId = localStorage.getItem('smartassist_guest_id');
    if (guestId) {
      params.set('guestId', guestId);
    }

    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function showToast(message, type = 'info') {
    if (!el.toastContainer) {
      const c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(c);
      el.toastContainer = c;
    }

    const toast = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';

    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-lg border text-sm flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 ${
      isError
        ? 'bg-red-950/90 text-red-200 border-red-800'
        : isSuccess
        ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
        : 'bg-surface-container-highest text-on-surface border-surface-container'
    }`;

    const icon = isError ? 'error' : isSuccess ? 'check_circle' : 'info';
    toast.innerHTML = `
      <span class="material-symbols-outlined text-[18px] shrink-0">${icon}</span>
      <span class="flex-1">${escapeHtml(message)}</span>
    `;

    el.toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return 'recently';
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Simple Markdown parser for answers
  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);

    // Code blocks
    html = html.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre class="my-3 p-3 rounded-xl bg-surface-container-lowest text-primary font-code-sm text-xs overflow-x-auto border border-surface-container"><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-container-highest font-code-sm text-xs text-primary">$1</code>');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h4 class="font-title-md text-sm font-semibold text-primary mt-3 mb-1.5">$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3 class="font-title-md text-base font-semibold text-on-surface mt-3 mb-2">$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2 class="font-headline-lg text-lg font-bold text-on-surface mt-4 mb-2">$1</h2>');

    // Bold & italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-on-surface">$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

    // Bullet points
    html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-body-sm text-on-surface my-0.5">$1</li>');

    // Numbered lists
    html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="ml-4 list-decimal text-body-sm text-on-surface my-0.5">$2</li>');

    // Line breaks
    html = html.replace(/\n\n/g, '<p class="my-2"></p>');
    html = html.replace(/\n/g, '<br/>');

    // Citation badges like [Page X] or [Pages X–Y]
    html = html.replace(/\[(Pages?\s+\d+(?:[–-]\d+)?)\]/gi, (match, label) => {
      const pageNumMatch = label.match(/\d+/);
      const pageNum = pageNumMatch ? pageNumMatch[0] : 1;
      return `<button type="button" class="inline-flex items-center gap-0.5 px-2 py-0.5 my-0.5 rounded-full bg-secondary-container hover:bg-primary-container hover:text-white text-primary font-code-sm text-xs font-semibold transition-colors cursor-pointer citation-jump-btn" data-page="${pageNum}"><span class="material-symbols-outlined text-[13px]">description</span><span>${label}</span></button>`;
    });

    return html;
  }

  // ---------------------------------------------------------------------------
  // 4. Initial Document Loading & Synchronization
  // ---------------------------------------------------------------------------
  function syncDocumentsToConversations(docs) {
    if (!Array.isArray(docs)) return;
    const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
    let changed = false;

    docs.forEach(doc => {
      const chatId = `pdf_${doc.id}`;
      let conv = allConvs.find(c => c.id === chatId || (c.section === 'chat_with_pdf' && c.docId === doc.id));
      const title = (doc.filename || 'PDF Document').replace(/\.pdf$/i, '');
      const uploadTime = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : Date.now();

      if (!conv) {
        allConvs.push({
          id: chatId,
          section: 'chat_with_pdf',
          title: title,
          filename: doc.filename,
          docId: doc.id,
          timestamp: uploadTime,
          messages: []
        });
        changed = true;
      } else {
        if (!conv.filename) {
          conv.filename = doc.filename;
          changed = true;
        }
        if (!conv.docId) {
          conv.docId = doc.id;
          changed = true;
        }
        if (conv.section !== 'chat_with_pdf') {
          conv.section = 'chat_with_pdf';
          changed = true;
        }
      }
    });

    if (changed && window.saveStoredConversations) {
      window.saveStoredConversations(allConvs);
    }
    if (changed && window.renderRecentChats) {
      window.renderRecentChats();
    }
  }

  function syncActivePdfChat(messagesOverride) {
    if (!state.activeDoc || !state.activeDocId) return;
    const doc = state.activeDoc;
    const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
    const chatId = `pdf_${doc.id}`;
    let conv = allConvs.find(c => c.id === chatId || (c.section === 'chat_with_pdf' && c.docId === doc.id));
    const title = (doc.filename || 'PDF Document').replace(/\.pdf$/i, '');
    const uploadTime = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : Date.now();
    const rawMsgs = messagesOverride !== undefined ? messagesOverride : (state.messages || []);

    const mappedMsgs = rawMsgs.map(m => ({
      role: m.role === 'model' ? 'model' : 'user',
      text: m.content || m.text || '',
      citations: m.citations || [],
      excerpt: m.excerpt || null,
      score: m.score || null,
      time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
    }));

    if (!conv) {
      conv = {
        id: chatId,
        section: 'chat_with_pdf',
        title: title,
        filename: doc.filename,
        docId: doc.id,
        timestamp: Date.now(),
        messages: mappedMsgs
      };
      allConvs.unshift(conv);
    } else {
      conv.id = chatId;
      conv.section = 'chat_with_pdf';
      conv.filename = doc.filename;
      conv.docId = doc.id;
      conv.messages = mappedMsgs;
      conv.timestamp = Date.now();
      const idx = allConvs.indexOf(conv);
      if (idx > 0) {
        allConvs.splice(idx, 1);
        allConvs.unshift(conv);
      }
    }

    if (window.saveStoredConversations) {
      window.saveStoredConversations(allConvs);
    }
    if (window.setActiveChatId) {
      window.setActiveChatId(chatId, 'chat_with_pdf');
    }
    if (window.renderRecentChats) {
      window.renderRecentChats();
    }
  }

  async function loadDocuments() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/pdf/documents', { headers });
      if (!res.ok) throw new Error('Failed to fetch documents');
      const data = await res.json();
      state.documents = data.documents || [];

      // Sync documents into smartassist_conversations under chat_with_pdf
      syncDocumentsToConversations(state.documents);

      // Determine active document
      if (state.documents.length > 0) {
        // If URL has docId or chatId, prioritize that
        const urlParams = new URLSearchParams(window.location.search);
        const paramDocId = urlParams.get('docId');
        const paramChatId = urlParams.get('chatId');
        let requestedDocId = paramDocId;

        if (!requestedDocId && paramChatId) {
          const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
          const found = allConvs.find(c => c.id === paramChatId);
          if (found && found.docId) requestedDocId = found.docId;
          else if (paramChatId.startsWith('pdf_')) requestedDocId = paramChatId.replace('pdf_', '');
        }

        const activeSectionChatId = window.getActiveChatId ? window.getActiveChatId('chat_with_pdf') : null;
        if (!requestedDocId && activeSectionChatId) {
          const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
          const found = allConvs.find(c => c.id === activeSectionChatId);
          if (found && found.docId) requestedDocId = found.docId;
          else if (activeSectionChatId.startsWith('pdf_')) requestedDocId = activeSectionChatId.replace('pdf_', '');
        }

        const savedId = requestedDocId || localStorage.getItem('smartassist_active_pdf_id');
        const match = state.documents.find(d => d.id === savedId);
        state.activeDocId = match ? match.id : state.documents[0].id;
      } else {
        state.activeDocId = null;
      }

      await loadActiveDocumentDetails();
    } catch (err) {
      console.warn('[ChatWithPDF] loadDocuments error:', err);
      renderUI();
    }
  }

  async function loadActiveDocumentDetails() {
    if (!state.activeDocId) {
      state.activeDoc = null;
      state.messages = [];
      state.isSuggestionsLoading = false;
      renderUI();
      if (window.renderRecentChats) {
        window.renderRecentChats();
      }
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/pdf/document/${state.activeDocId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        state.activeDoc = data.document;
        localStorage.setItem('smartassist_active_pdf_id', state.activeDocId);

        // Reset page scope to full document
        state.scopeMin = 1;
        state.scopeMax = state.activeDoc.pageCount || 1;
      }

      // Load conversation messages
      await loadMessages();

      // Sync active conversation to smartassist_conversations and sidebar
      syncActivePdfChat();

      // Check suggestions: if missing, empty, or containing legacy stale question on a resume, fetch dynamically
      const doc = state.activeDoc;
      const legacyBadQuestion = 'Explain the scheduling algorithms discussed';
      const isLegacyBadResume = doc?.filename?.toLowerCase().includes('resume') &&
        Array.isArray(doc.suggestedQuestions) &&
        doc.suggestedQuestions.includes(legacyBadQuestion);

      if (doc && (!Array.isArray(doc.suggestedQuestions) || doc.suggestedQuestions.length < 2 || isLegacyBadResume)) {
        fetchDocumentSuggestions(state.activeDocId);
      }
    } catch (err) {
      console.warn('[ChatWithPDF] loadActiveDocumentDetails error:', err);
    }

    renderUI();
  }

  async function fetchDocumentSuggestions(docId, forceRefresh = false) {
    if (!docId) return;

    // Race condition guard: remember which document we requested suggestions for
    state.currentSuggestionsDocId = docId;
    state.isSuggestionsLoading = true;
    renderSuggestedQuestions();

    try {
      const headers = await getAuthHeaders();
      const qs = forceRefresh ? '?refresh=true' : '';
      const res = await fetch(`/api/pdf/document/${docId}/suggestions${qs}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch document suggestions');

      const data = await res.json();

      // Discard stale responses if user switched document while request was in-flight
      if (state.activeDocId !== docId || state.currentSuggestionsDocId !== docId) {
        return;
      }

      if (state.activeDoc && state.activeDoc.id === docId) {
        state.activeDoc.suggestedQuestions = data.suggestions || [];
      }
    } catch (err) {
      console.warn('[ChatWithPDF] fetchDocumentSuggestions error:', err);
    } finally {
      if (state.activeDocId === docId) {
        state.isSuggestionsLoading = false;
        renderSuggestedQuestions();
      }
    }
  }

  async function loadMessages() {
    if (!state.activeDocId) {
      state.messages = [];
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/pdf/messages/${state.activeDocId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        state.messages = data.messages || [];
      }
    } catch (err) {
      console.warn('[ChatWithPDF] loadMessages error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Render UI to DOM
  // ---------------------------------------------------------------------------
  function renderUI() {
    const doc = state.activeDoc;

    // 1. Top Ribbon Metrics
    if (el.chromaChunksBadge) {
      if (doc && doc.chunkCount > 0) {
        el.chromaChunksBadge.innerHTML = `
          <span class="material-symbols-outlined text-[16px] text-tertiary">memory</span>
          <span class="font-label-sm text-label-sm text-on-surface">VectorDB: ${doc.chunkCount.toLocaleString()} Chunks</span>
        `;
      } else {
        el.chromaChunksBadge.innerHTML = `
          <span class="material-symbols-outlined text-[16px] text-tertiary">memory</span>
          <span class="font-label-sm text-label-sm text-on-surface-variant">VectorDB: Ready</span>
        `;
      }
    }

    // 2. Active Document Card vs Empty State
    if (doc) {
      if (el.activeDocCard) el.activeDocCard.classList.remove('hidden');
      if (el.docEmptyState) el.docEmptyState.classList.add('hidden');

      if (el.docFilename) el.docFilename.textContent = doc.filename;
      if (el.docMeta) {
        el.docMeta.textContent = `${doc.pageCount} page${doc.pageCount > 1 ? 's' : ''} • ${formatBytes(doc.fileSize)} • ${formatTimeAgo(doc.uploadedAt)}`;
      }

      if (el.docStatusBadge) {
        if (doc.isScanned) {
          el.docStatusBadge.className = 'px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 font-label-sm text-label-sm flex items-center gap-1 shrink-0';
          el.docStatusBadge.innerHTML = `
            <span class="material-symbols-outlined text-[14px]">warning</span>
            <span>Scanned (OCR Needed)</span>
          `;
        } else {
          el.docStatusBadge.className = 'px-2.5 py-1 rounded-full bg-[rgba(22,134,92,0.12)] text-[#16865C] font-label-sm text-label-sm flex items-center gap-1 shrink-0';
          el.docStatusBadge.innerHTML = `
            <span class="material-symbols-outlined text-[14px]">check_circle</span>
            <span>Processed &amp; Indexed</span>
          `;
        }
      }

      if (el.docEmbeddingModel) {
        const modelName = doc.indexSettings?.embeddingModel || 'gemini-embedding-001';
        el.docEmbeddingModel.textContent = `Embeddings: ${modelName}`;
      }

      if (el.docSyncStatus) {
        el.docSyncStatus.textContent = doc.isScanned ? 'OCR Pending' : '100% Synced';
      }

      if (el.groundingDocTitle) {
        el.groundingDocTitle.textContent = `Grounding: ${doc.filename}`;
      }

      // Query input placeholder
      if (el.queryInput) {
        el.queryInput.placeholder = `Ask a question about ${doc.filename}…`;
        el.queryInput.disabled = false;
      }
      if (el.sendBtn) el.sendBtn.disabled = false;

    } else {
      // Empty state
      if (el.activeDocCard) el.activeDocCard.classList.add('hidden');
      if (el.docEmptyState) el.docEmptyState.classList.remove('hidden');

      if (el.groundingDocTitle) {
        el.groundingDocTitle.textContent = 'Grounding: No Document Selected';
      }
      if (el.queryInput) {
        el.queryInput.placeholder = 'Upload a PDF above to begin chatting…';
        el.queryInput.disabled = true;
      }
      if (el.sendBtn) el.sendBtn.disabled = true;
    }

    // 3. Table of Contents
    renderTableOfContents();

    // 4. Suggested Questions
    renderSuggestedQuestions();

    // 5. Scope Dropdown Label
    renderScopeDropdown();

    // 6. Messages Stream
    renderMessages();
  }

  function renderTableOfContents() {
    if (!el.tocList) return;
    const doc = state.activeDoc;

    if (!doc || !doc.chapters || doc.chapters.length === 0) {
      if (el.tocCount) el.tocCount.textContent = 'No chapters';
      el.tocList.innerHTML = `
        <div class="px-3 py-4 text-center text-on-surface-variant font-body-sm text-body-sm bg-surface-container-low rounded-xl">
          <span class="material-symbols-outlined text-[20px] mb-1 opacity-70">article</span>
          <p>${doc ? 'No explicit chapter headings detected in document outline.' : 'Upload a PDF to view Table of Contents.'}</p>
        </div>
      `;
      return;
    }

    if (el.tocCount) {
      el.tocCount.textContent = `${doc.chapters.length} Chapter${doc.chapters.length > 1 ? 's' : ''} detected`;
    }

    let html = '';
    doc.chapters.forEach((chap, idx) => {
      const isSelected = (state.scopeMin === chap.pageStart && state.scopeMax === chap.pageEnd);
      const activeClass = isSelected
        ? 'bg-secondary-container/80 text-primary font-medium shadow-sm'
        : 'hover:bg-surface-container text-on-surface-variant hover:text-on-surface';

      html += `
        <button class="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors group ${activeClass} chapter-select-btn"
          data-start="${chap.pageStart}" data-end="${chap.pageEnd}" data-title="${escapeHtml(chap.title)}" type="button">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="font-code-sm text-code-sm ${isSelected ? 'text-primary font-bold' : 'text-tertiary-container group-hover:text-primary'}">
              ${chap.number.padStart(2, '0')}
            </span>
            <span class="font-body-md text-body-md truncate ${isSelected ? 'font-semibold' : ''}">${escapeHtml(chap.title)}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${isSelected ? '<span class="w-2 h-2 rounded-full bg-primary-container"></span>' : ''}
            <span class="font-code-sm text-code-sm ${isSelected ? 'text-primary' : 'text-outline'}">p. ${chap.pageStart}–${chap.pageEnd}</span>
          </div>
        </button>
      `;
    });

    el.tocList.innerHTML = html;

    // Attach click listeners to chapter buttons
    el.tocList.querySelectorAll('.chapter-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const start = parseInt(btn.dataset.start, 10);
        const end = parseInt(btn.dataset.end, 10);
        const title = btn.dataset.title;

        state.scopeMin = start;
        state.scopeMax = end;
        renderScopeDropdown();
        renderTableOfContents();
        showToast(`Filtered chat scope to Chapter: "${title}" (Pages ${start}–${end})`, 'info');
      });
    });
  }

  function renderSuggestedQuestions() {
    if (!el.suggestedQuestionsContainer) return;
    const doc = state.activeDoc;

    // 1. Empty state: no document active
    if (!doc) {
      el.suggestedQuestionsContainer.innerHTML = `
        <span class="text-on-surface-variant font-body-sm text-xs italic px-2 flex items-center gap-1.5 py-1">
          <span class="material-symbols-outlined text-[15px] opacity-70">info</span>
          <span>Upload or select a PDF above to see document-grounded questions.</span>
        </span>
      `;
      return;
    }

    // 2. Loading state: generating suggestions with AI
    if (state.isSuggestionsLoading) {
      el.suggestedQuestionsContainer.innerHTML = `
        <div class="flex items-center gap-2 px-2 py-1">
          <span class="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0"></span>
          <span class="text-primary font-body-sm text-xs font-medium">Generating questions grounded in "${escapeHtml(doc.filename)}"…</span>
        </div>
      `;
      return;
    }

    // 3. Document is scanned or has no text layer
    if (doc.isScanned) {
      el.suggestedQuestionsContainer.innerHTML = `
        <span class="text-amber-600 font-body-sm text-xs px-2 flex items-center gap-1.5 py-1">
          <span class="material-symbols-outlined text-[15px]">warning</span>
          <span>This document contains no extractable text layer. Suggestions unavailable.</span>
        </span>
      `;
      return;
    }

    // 4. Insufficient text or empty questions
    if (!doc.suggestedQuestions || doc.suggestedQuestions.length === 0) {
      el.suggestedQuestionsContainer.innerHTML = `
        <span class="text-on-surface-variant font-body-sm text-xs italic px-2 flex items-center gap-1 py-1">
          <span class="material-symbols-outlined text-[15px] opacity-60">help_outline</span>
          <span>Type any question below to explore this document.</span>
        </span>
      `;
      return;
    }

    // 5. Render active suggested question chips
    let html = '';
    const icons = ['auto_stories', 'schema', 'quiz', 'lightbulb', 'help_center'];
    doc.suggestedQuestions.forEach((q, idx) => {
      const icon = icons[idx % icons.length];
      html += `
        <button class="shrink-0 px-3 py-1.5 rounded-xl bg-surface-container-lowest hover:bg-secondary-container hover:text-primary text-on-surface font-label-md text-label-md shadow-sm transition-all duration-150 flex items-center gap-1.5 suggested-q-chip active:scale-95 group cursor-pointer"
          data-question="${escapeHtml(q)}" title="${escapeHtml(q)}" type="button">
          <span class="material-symbols-outlined text-[16px] text-primary group-hover:rotate-12 transition-transform">${icon}</span>
          <span class="truncate max-w-[280px] sm:max-w-none">${escapeHtml(q)}</span>
        </button>
      `;
    });

    el.suggestedQuestionsContainer.innerHTML = html;

    // Attach click listener to suggested question chips
    el.suggestedQuestionsContainer.querySelectorAll('.suggested-q-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.dataset.question;
        if (el.queryInput) {
          el.queryInput.value = q;
        }
        submitQuery(q);
      });
    });
  }

  function renderScopeDropdown() {
    if (!el.scopeLabel) return;
    const doc = state.activeDoc;
    if (!doc) {
      el.scopeLabel.textContent = 'Scope: All Pages';
      return;
    }

    if (state.scopeMin === 1 && state.scopeMax >= doc.pageCount) {
      el.scopeLabel.textContent = `Scope: All Pages (1–${doc.pageCount})`;
    } else {
      el.scopeLabel.textContent = `Scope: Pages ${state.scopeMin}–${state.scopeMax}`;
    }

    if (el.topkPill) {
      el.topkPill.textContent = `Top-k: ${state.topK}`;
    }
  }

  function renderMessages() {
    if (!el.messageStream) return;

    if (!state.activeDoc) {
      el.messageStream.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-center text-on-surface-variant my-auto">
          <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-primary mb-3 shadow-inner">
            <span class="material-symbols-outlined text-[32px]">upload_file</span>
          </div>
          <h4 class="font-title-md text-base text-on-surface font-semibold mb-1">No Active PDF Document</h4>
          <p class="font-body-sm text-sm max-w-sm">Please upload or select a PDF document from the panel on the left to start asking grounded questions.</p>
        </div>
      `;
      return;
    }

    if (state.messages.length === 0) {
      el.messageStream.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-center text-on-surface-variant my-auto">
          <div class="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary-container mb-3 shadow-sm">
            <span class="material-symbols-outlined text-[28px]">chat_bubble_outline</span>
          </div>
          <h4 class="font-title-md text-base text-on-surface font-semibold mb-1">Ready to Answer from ${escapeHtml(state.activeDoc.filename)}</h4>
          <p class="font-body-sm text-sm max-w-sm">Ask any question or click a suggested prompt above. Answers are strictly grounded in the document with page citations.</p>
        </div>
      `;
      return;
    }

    let html = '';
    state.messages.forEach(msg => {
      if (msg.role === 'user') {
        html += renderUserMessage(msg);
      } else {
        html += renderModelMessage(msg);
      }
    });

    el.messageStream.innerHTML = html;
    attachMessageActionListeners();
    scrollToBottom();
  }

  function renderUserMessage(msg) {
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="flex items-start gap-space-sm justify-end">
        <div class="flex flex-col items-end gap-1 max-w-[85%]">
          <div class="px-4 py-3 rounded-2xl rounded-tr-sm bg-primary-container text-on-primary-container shadow-md">
            <p class="font-body-md text-body-md">${escapeHtml(msg.content)}</p>
          </div>
          <span class="font-code-sm text-code-sm text-on-surface-variant">${time}</span>
        </div>
        <div class="w-8 h-8 rounded-full bg-primary-container/30 flex items-center justify-center text-primary font-bold text-xs shrink-0 mt-1 shadow-sm">
          U
        </div>
      </div>
    `;
  }

  function renderModelMessage(msg) {
    const hasCitations = Array.isArray(msg.citations) && msg.citations.length > 0;
    const citationChips = hasCitations
      ? msg.citations.map(c => `
          <button class="px-2.5 py-0.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm flex items-center gap-1 transition-colors group citation-jump-btn"
            data-page="${c.page}" type="button">
            <span class="material-symbols-outlined text-[14px] text-primary">description</span>
            <span class="font-code-sm text-code-sm font-medium">${escapeHtml(c.label || `Page ${c.page}`)}</span>
            <span class="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
          </button>
        `).join('')
      : '';

    const scoreBadge = (msg.score && typeof msg.score === 'number' && msg.score > 0)
      ? `<span class="font-code-sm text-code-sm text-on-surface-variant">Relevance: ${Math.round(msg.score * 100)}%</span>`
      : '';

    const excerptHtml = msg.excerpt ? `
      <div class="mt-1 p-3.5 rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-2 border border-surface-container">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 text-primary">
            <span class="material-symbols-outlined text-[16px]">menu_book</span>
            <span class="font-label-sm text-label-sm font-semibold uppercase tracking-wide">Source Citation • Page ${msg.excerpt.pageNumber}</span>
          </div>
          ${msg.excerpt.relevancePercent ? `<span class="font-code-sm text-code-sm text-on-surface-variant">Relevance: ${msg.excerpt.relevancePercent}%</span>` : ''}
        </div>
        <blockquote class="font-body-sm text-body-sm italic text-on-surface-variant pl-3 border-l-2 border-primary-container/40">
          “${escapeHtml(msg.excerpt.snippet)}”
        </blockquote>
        <div class="flex items-center justify-end pt-1">
          <button class="text-primary hover:text-primary-fixed-variant font-label-sm text-label-sm flex items-center gap-1 citation-jump-btn"
            data-page="${msg.excerpt.pageNumber}" type="button">
            <span>Jump to page in PDF</span>
            <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
          </button>
        </div>
      </div>
    ` : '';

    return `
      <div class="flex items-start gap-space-sm">
        <div class="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-on-primary shrink-0 mt-1 shadow-sm">
          <span class="material-symbols-outlined text-[18px]">smart_toy</span>
        </div>
        <div class="flex flex-col gap-space-sm max-w-[90%] w-full">
          <!-- Citations & Status Header -->
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-0.5 rounded-full bg-secondary-container text-primary font-label-sm text-label-sm font-semibold flex items-center gap-1 shadow-xs">
              <span class="material-symbols-outlined text-[14px]">verified</span>
              <span>SmartAssist Verified Answer</span>
            </span>
            ${citationChips}
            ${scoreBadge}
          </div>

          <!-- Answer Body -->
          <div class="p-space-md rounded-2xl rounded-tl-sm bg-surface-container-low text-on-surface flex flex-col gap-space-sm shadow-xs answer-body">
            <div class="font-body-md text-body-md leading-relaxed prose max-w-none">
              ${renderMarkdown(msg.content)}
            </div>
            ${excerptHtml}
          </div>

          <!-- Action Bar -->
          <div class="flex items-center gap-2 pt-0.5">
            <button class="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors copy-msg-btn"
              data-text="${escapeHtml(msg.content)}" title="Copy answer" type="button">
              <span class="material-symbols-outlined text-[16px]">content_copy</span>
            </button>
            <button class="p-1 rounded-lg text-on-surface-variant hover:text-[#16865C] hover:bg-surface-container transition-colors thumb-btn"
              title="Helpful grounding" type="button">
              <span class="material-symbols-outlined text-[16px]">thumb_up</span>
            </button>
            <button class="p-1 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors thumb-btn"
              title="Report issue" type="button">
              <span class="material-symbols-outlined text-[16px]">thumb_down</span>
            </button>
            <span class="text-outline-variant">•</span>
            <button class="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-1 simpler-btn"
              data-text="${escapeHtml(msg.content)}" type="button">
              <span class="material-symbols-outlined text-[14px]">psychology_alt</span>
              <span>Explain in simpler terms</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachMessageActionListeners() {
    if (!el.messageStream) return;

    // Citation jump buttons (opens PDF viewer on exact page)
    el.messageStream.querySelectorAll('.citation-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page, 10) || 1;
        openPdfViewer(page);
      });
    });

    // Copy message text
    el.messageStream.querySelectorAll('.copy-msg-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = btn.dataset.text;
        try {
          await navigator.clipboard.writeText(text);
          showToast('Answer copied to clipboard!', 'success');
        } catch (e) {
          showToast('Could not copy to clipboard', 'error');
        }
      });
    });

    // Thumbs up/down feedback
    el.messageStream.querySelectorAll('.thumb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.add('scale-125', 'text-primary');
        setTimeout(() => btn.classList.remove('scale-125'), 200);
        showToast('Thank you for your feedback!', 'success');
      });
    });

    // Simpler terms prompt
    el.messageStream.querySelectorAll('.simpler-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (el.queryInput) {
          el.queryInput.value = 'Can you re-explain the previous concept in simpler, beginner-friendly terms with an everyday analogy?';
          submitQuery(el.queryInput.value);
        }
      });
    });
  }

  function scrollToBottom() {
    if (el.messageStream) {
      el.messageStream.scrollTop = el.messageStream.scrollHeight;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Real PDF Upload & Processing Handler
  // ---------------------------------------------------------------------------
  async function uploadPdfFile(file) {
    if (!file) return;

    // Client-side validations
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && file.type !== 'application/pdf') {
      showToast('Invalid file format. Please upload a PDF document (.pdf).', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('File exceeds the 50 MB limit. Please select a smaller PDF.', 'error');
      return;
    }

    state.isUploading = true;
    showUploadProgress(true, `Uploading & Indexing "${file.name}"…`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const headers = await getAuthHeaders();
      // Remove Content-Type header so browser sets multipart boundary automatically
      delete headers['Content-Type'];

      const res = await fetch('/api/pdf/upload', {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      showToast(`"${file.name}" indexed successfully! (${data.document.pageCount} pages, ${data.document.chunkCount} chunks)`, 'success');

      // Reload document list & set active
      await loadDocuments();
      if (data.document && data.document.id) {
        state.activeDocId = data.document.id;
        await loadActiveDocumentDetails();
      }
    } catch (err) {
      console.error('[Upload Error]:', err);
      showToast(err.message || 'Error uploading and processing PDF', 'error');
    } finally {
      state.isUploading = false;
      showUploadProgress(false);
      if (el.fileUpload) el.fileUpload.value = '';
    }
  }

  function showUploadProgress(show, message = 'Processing PDF…') {
    if (!el.uploadProgressContainer) return;
    if (show) {
      el.uploadProgressContainer.classList.remove('hidden');
      if (el.uploadProgressText) el.uploadProgressText.textContent = message;
    } else {
      el.uploadProgressContainer.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // 7. SSRF-Safe PDF Download from URL Handler
  // ---------------------------------------------------------------------------
  async function importPdfFromUrl(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      if (el.urlErrorAlert) {
        el.urlErrorAlert.textContent = 'Please enter a valid HTTP or HTTPS URL.';
        el.urlErrorAlert.classList.remove('hidden');
      }
      return;
    }

    if (el.urlErrorAlert) el.urlErrorAlert.classList.add('hidden');
    if (el.urlSubmitBtn) {
      el.urlSubmitBtn.disabled = true;
      el.urlSubmitBtn.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span><span>Downloading…</span>';
    }

    try {
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const res = await fetch('/api/pdf/upload-url', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to download PDF from URL');
      }

      showToast(`URL document "${data.document.filename}" downloaded and indexed!`, 'success');
      closeUrlModal();

      await loadDocuments();
      state.activeDocId = data.document.id;
      await loadActiveDocumentDetails();
    } catch (err) {
      if (el.urlErrorAlert) {
        el.urlErrorAlert.textContent = err.message || 'Could not download PDF from this URL.';
        el.urlErrorAlert.classList.remove('hidden');
      }
    } finally {
      if (el.urlSubmitBtn) {
        el.urlSubmitBtn.disabled = false;
        el.urlSubmitBtn.innerHTML = '<span>Download &amp; Index</span>';
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Real RAG Chat Query Handler
  // ---------------------------------------------------------------------------
  async function submitQuery(queryText) {
    if (state.isLoading) return;

    const trimmed = (queryText || (el.queryInput ? el.queryInput.value : '')).trim();
    if (!trimmed) return;

    if (!state.activeDocId) {
      showToast('Please upload or select a PDF document first.', 'error');
      return;
    }

    if (el.queryInput) el.queryInput.value = '';

    // Append user message immediately to state & UI
    const tempUserMsg = {
      id: 'temp_user_' + Date.now(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString()
    };
    state.messages.push(tempUserMsg);
    syncActivePdfChat();
    renderMessages();

    // Show loading skeleton bubble
    state.isLoading = true;
    const loadingElem = document.createElement('div');
    loadingElem.id = 'chat-loading-indicator';
    loadingElem.className = 'flex items-start gap-space-sm';
    loadingElem.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-on-primary shrink-0 mt-1 shadow-sm animate-pulse">
        <span class="material-symbols-outlined text-[18px]">smart_toy</span>
      </div>
      <div class="p-4 rounded-2xl rounded-tl-sm bg-surface-container-low text-on-surface shadow-xs max-w-[85%] flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-primary-container animate-bounce"></span>
          <span class="w-2 h-2 rounded-full bg-primary-container animate-bounce [animation-delay:0.2s]"></span>
          <span class="w-2 h-2 rounded-full bg-primary-container animate-bounce [animation-delay:0.4s]"></span>
        </div>
        <span class="font-body-sm text-body-sm text-on-surface-variant">Searching chunks &amp; verifying citations…</span>
      </div>
    `;
    el.messageStream.appendChild(loadingElem);
    scrollToBottom();

    try {
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const res = await fetch('/api/pdf/query', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          docId: state.activeDocId,
          query: trimmed,
          scopeMin: state.scopeMin,
          scopeMax: state.scopeMax,
          topK: state.topK
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to query PDF');
      }

      // Add model answer to state
      state.messages.push({
        id: data.messageId || 'model_' + Date.now(),
        role: 'model',
        content: data.answer,
        citations: data.citations || [],
        excerpt: data.topExcerpt || null,
        score: data.relevanceScore || null,
        timestamp: new Date().toISOString()
      });
      syncActivePdfChat();

    } catch (err) {
      console.error('[Query Error]:', err);
      state.messages.push({
        id: 'err_' + Date.now(),
        role: 'model',
        content: `**Error generating response:** ${err.message || 'Could not communicate with RAG engine.'}`,
        citations: [],
        timestamp: new Date().toISOString()
      });
      syncActivePdfChat();
      showToast(err.message || 'Error querying document', 'error');
    } finally {
      state.isLoading = false;
      const loader = document.getElementById('chat-loading-indicator');
      if (loader) loader.remove();
      renderMessages();
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Document Actions (View, Download, Replace, Delete, Re-index)
  // ---------------------------------------------------------------------------
  async function openPdfViewer(page = 1) {
    if (!state.activeDocId || !state.activeDoc) {
      showToast('No active PDF to view.', 'error');
      return;
    }

    const qs = await getAuthQueryString();
    // Query string must precede hash fragment so the server receives query parameters
    const viewUrl = `/api/pdf/document/${state.activeDocId}/view${qs}#page=${page}`;

    if (el.viewModalIframe) el.viewModalIframe.src = viewUrl;
    if (el.viewModalTitle) el.viewModalTitle.textContent = `${state.activeDoc.filename} (Page ${page})`;
    if (el.viewModalDownload) {
      el.viewModalDownload.onclick = () => downloadActivePdf();
    }
    if (el.viewModalNewTab) {
      el.viewModalNewTab.href = viewUrl;
    }
    if (el.viewModal) el.viewModal.classList.remove('hidden');
  }

  function closePdfViewer() {
    if (el.viewModal) el.viewModal.classList.add('hidden');
    if (el.viewModalIframe) el.viewModalIframe.src = 'about:blank';
  }

  async function downloadActivePdf() {
    if (!state.activeDocId || !state.activeDoc) {
      showToast('No active document to download.', 'error');
      return;
    }

    const docId = state.activeDocId;
    const filename = state.activeDoc.filename || 'document.pdf';
    showToast(`Downloading "${filename}"…`, 'info');

    try {
      const headers = await getAuthHeaders();
      const qs = await getAuthQueryString();
      const res = await fetch(`/api/pdf/document/${docId}/download${qs}`, {
        method: 'GET',
        headers
      });

      if (!res.ok) {
        let errMsg = 'Download failed';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) {
          errMsg = await res.text() || errMsg;
        }
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      showToast(`Downloaded "${filename}" successfully!`, 'success');
    } catch (err) {
      console.error('[PDF Download Error]:', err);
      showToast(err.message || 'Error downloading PDF document.', 'error');
    }
  }

  function promptReplacePdf() {
    if (!state.activeDocId) {
      showToast('No active PDF selected to replace.', 'error');
      return;
    }
    if (el.replaceFileInput) el.replaceFileInput.click();
  }

  async function handleReplaceFile(file) {
    if (!file || !state.activeDocId) return;

    const confirmed = confirm(`Are you sure you want to replace "${state.activeDoc.filename}" with "${file.name}"? Previous chat history will be refreshed.`);
    if (!confirmed) return;

    if (state.activeDoc) state.activeDoc.suggestedQuestions = [];
    state.isSuggestionsLoading = true;
    renderSuggestedQuestions();

    showUploadProgress(true, `Replacing with "${file.name}"…`);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const headers = await getAuthHeaders();
      delete headers['Content-Type'];

      const res = await fetch(`/api/pdf/replace/${state.activeDocId}`, {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Replacement failed');

      showToast(`Document replaced successfully with "${data.document.filename}"!`, 'success');
      await loadDocuments();
      await loadActiveDocumentDetails();
    } catch (err) {
      showToast(err.message || 'Replacement failed', 'error');
    } finally {
      showUploadProgress(false);
      if (el.replaceFileInput) el.replaceFileInput.value = '';
    }
  }

  function promptDeleteDoc() {
    if (!state.activeDocId || !state.activeDoc) {
      showToast('No active document to delete.', 'error');
      return;
    }

    if (el.deleteDocName) el.deleteDocName.textContent = state.activeDoc.filename;
    if (el.deleteModal) el.deleteModal.classList.remove('hidden');
  }

  async function confirmDeleteDoc() {
    if (!state.activeDocId) return;

    try {
      const deletedDocId = state.activeDocId;
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/pdf/document/${deletedDocId}`, {
        method: 'DELETE',
        headers
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete document');

      showToast('Document and its indexed chunks were deleted.', 'success');
      closeDeleteModal();

      state.activeDocId = null;
      state.activeDoc = null;
      state.isSuggestionsLoading = false;
      localStorage.removeItem('smartassist_active_pdf_id');

      // Remove from smartassist_conversations
      if (window.getStoredConversations && window.saveStoredConversations) {
        const remaining = window.getStoredConversations().filter(c => c.docId !== deletedDocId && c.id !== `pdf_${deletedDocId}`);
        window.saveStoredConversations(remaining);
      }
      if (window.deleteConversationFromSupabase) {
        window.deleteConversationFromSupabase(`pdf_${deletedDocId}`);
      }
      if (window.setActiveChatId) {
        window.setActiveChatId(null, 'chat_with_pdf');
      }

      renderUI();
      await loadDocuments();
    } catch (err) {
      showToast(err.message || 'Error deleting document', 'error');
    }
  }

  function closeDeleteModal() {
    if (el.deleteModal) el.deleteModal.classList.add('hidden');
  }

  function openIndexSettings() {
    if (!state.activeDoc) {
      showToast('Upload or select a PDF first to tune index settings.', 'info');
      return;
    }

    const current = state.activeDoc.indexSettings || { chunkSize: 900, chunkOverlap: 150, topK: 5 };
    if (el.settingChunkSize) el.settingChunkSize.value = current.chunkSize || 900;
    if (el.settingChunkOverlap) el.settingChunkOverlap.value = current.chunkOverlap || 150;
    if (el.settingTopK) el.settingTopK.value = current.topK || 5;

    if (el.settingsModal) el.settingsModal.classList.remove('hidden');
  }

  function closeIndexSettings() {
    if (el.settingsModal) el.settingsModal.classList.add('hidden');
  }

  async function saveIndexSettings() {
    if (!state.activeDocId) return;

    const chunkSize = parseInt(el.settingChunkSize?.value || '900', 10);
    const chunkOverlap = parseInt(el.settingChunkOverlap?.value || '150', 10);
    const topK = parseInt(el.settingTopK?.value || '5', 10);

    state.topK = topK;

    showUploadProgress(true, 'Re-indexing document chunks with new parameters…');
    closeIndexSettings();

    try {
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const res = await fetch('/api/pdf/reindex', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          docId: state.activeDocId,
          chunkSize,
          chunkOverlap,
          topK
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to re-index');

      showToast(`Re-indexed into ${data.document.chunkCount} chunks with chunk size ${chunkSize}!`, 'success');
      await loadActiveDocumentDetails();
    } catch (err) {
      showToast(err.message || 'Error re-indexing document', 'error');
    } finally {
      showUploadProgress(false);
    }
  }

  async function clearChatHistory() {
    if (!state.activeDocId || state.messages.length === 0) return;
    const confirmed = confirm('Are you sure you want to clear chat history for this document?');
    if (!confirmed) return;

    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/pdf/messages/${state.activeDocId}/clear`, {
        method: 'POST',
        headers
      });

      state.messages = [];
      syncActivePdfChat([]);
      renderMessages();
      showToast('Chat history cleared.', 'info');
    } catch (e) {
      showToast('Could not clear chat history', 'error');
    }
  }

  function exportChatConversation() {
    if (!state.activeDoc || state.messages.length === 0) {
      showToast('No messages to export.', 'info');
      return;
    }

    let markdown = `# SmartAssist AI — Grounded Chat with ${state.activeDoc.filename}\n`;
    markdown += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

    state.messages.forEach(m => {
      if (m.role === 'user') {
        markdown += `### User\n${m.content}\n\n`;
      } else {
        markdown += `### SmartAssist AI (Verified Grounded Response)\n${m.content}\n\n`;
        if (m.citations && m.citations.length > 0) {
          markdown += `*Citations: ${m.citations.map(c => c.label || `Page ${c.page}`).join(', ')}*\n\n`;
        }
      }
      markdown += `---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.activeDoc.filename.replace(/\.pdf$/i, '')}_Chat_Notes.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Conversation exported as Markdown.', 'success');
  }

  function openUrlModal() {
    if (el.urlInput) el.urlInput.value = '';
    if (el.urlErrorAlert) el.urlErrorAlert.classList.add('hidden');
    if (el.urlModal) el.urlModal.classList.remove('hidden');
    if (el.urlInput) el.urlInput.focus();
  }

  function closeUrlModal() {
    if (el.urlModal) el.urlModal.classList.add('hidden');
  }

  // ---------------------------------------------------------------------------
  // 10. Wire DOM Event Handlers
  // ---------------------------------------------------------------------------
  function attachEventHandlers() {
    // Drag & Drop
    if (el.dropZone && el.fileUpload) {
      el.dropZone.addEventListener('click', (e) => {
        // Prevent click if user clicked "From URL" button inside dropzone
        if (e.target.closest('#from-url-btn')) return;
        el.fileUpload.click();
      });

      if (el.browseFilesBtn) {
        el.browseFilesBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          el.fileUpload.click();
        });
      }

      el.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.dropZone.classList.add('ring-2', 'ring-primary-container', 'bg-secondary-container/30');
      });

      el.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('ring-2', 'ring-primary-container', 'bg-secondary-container/30');
      });

      el.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        el.dropZone.classList.remove('ring-2', 'ring-primary-container', 'bg-secondary-container/30');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          uploadPdfFile(e.dataTransfer.files[0]);
        }
      });

      el.fileUpload.addEventListener('change', () => {
        if (el.fileUpload.files && el.fileUpload.files.length > 0) {
          uploadPdfFile(el.fileUpload.files[0]);
        }
      });
    }

    // From URL button
    if (el.fromUrlBtn) {
      el.fromUrlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openUrlModal();
      });
    }

    if (el.urlCancelBtn) el.urlCancelBtn.addEventListener('click', closeUrlModal);
    if (el.urlSubmitBtn) {
      el.urlSubmitBtn.addEventListener('click', () => {
        if (el.urlInput) importPdfFromUrl(el.urlInput.value);
      });
    }
    if (el.urlInput) {
      el.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          importPdfFromUrl(el.urlInput.value);
        }
      });
    }

    // Query Input & Send
    if (el.sendBtn) {
      el.sendBtn.addEventListener('click', () => submitQuery());
    }
    if (el.queryInput) {
      el.queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitQuery();
        }
      });
    }

    // Document Card Actions
    if (el.viewDocBtn) el.viewDocBtn.addEventListener('click', () => openPdfViewer(1));
    if (el.downloadDocBtn) el.downloadDocBtn.addEventListener('click', downloadActivePdf);
    if (el.replaceDocBtn) el.replaceDocBtn.addEventListener('click', promptReplacePdf);
    if (el.deleteDocBtn) el.deleteDocBtn.addEventListener('click', promptDeleteDoc);

    if (el.replaceFileInput) {
      el.replaceFileInput.addEventListener('change', () => {
        if (el.replaceFileInput.files && el.replaceFileInput.files.length > 0) {
          handleReplaceFile(el.replaceFileInput.files[0]);
        }
      });
    }

    // Delete Modal
    if (el.deleteCancelBtn) el.deleteCancelBtn.addEventListener('click', closeDeleteModal);
    if (el.deleteConfirmBtn) el.deleteConfirmBtn.addEventListener('click', confirmDeleteDoc);

    // PDF Viewer Modal
    if (el.viewModalClose) el.viewModalClose.addEventListener('click', closePdfViewer);

    // Index Settings Modal
    if (el.indexSettingsBtn) el.indexSettingsBtn.addEventListener('click', openIndexSettings);
    if (el.settingsCancelBtn) el.settingsCancelBtn.addEventListener('click', closeIndexSettings);
    if (el.settingsSaveBtn) el.settingsSaveBtn.addEventListener('click', saveIndexSettings);

    // Chat Stream actions
    if (el.exportChatBtn) el.exportChatBtn.addEventListener('click', exportChatConversation);
    if (el.clearChatBtn) el.clearChatBtn.addEventListener('click', clearChatHistory);

    // Auto Quiz Generator
    if (el.autoQuizBtn) {
      el.autoQuizBtn.addEventListener('click', () => {
        if (!state.activeDoc) {
          showToast('Upload a PDF first to generate quizzes.', 'info');
          return;
        }
        const prompt = `Generate a 5-question multiple choice practice quiz based on the key concepts in ${state.activeDoc.filename}. For each question provide 4 options (A, B, C, D) and then clearly indicate the correct answer with the source page citation.`;
        if (el.queryInput) el.queryInput.value = prompt;
        submitQuery(prompt);
      });
    }

    // Scope dropdown toggle
    if (el.scopeDropdownBtn && el.scopeDropdownMenu) {
      el.scopeDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        el.scopeDropdownMenu.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        if (el.scopeDropdownMenu) el.scopeDropdownMenu.classList.add('hidden');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 11. External Workspace API (Sidebar & Recent Chats Integration)
  // ---------------------------------------------------------------------------
  async function loadPdfConversationIntoView(chatOrId) {
    let targetDocId = null;
    let targetChatId = null;

    if (typeof chatOrId === 'object' && chatOrId !== null) {
      targetDocId = chatOrId.docId || (chatOrId.id && chatOrId.id.startsWith('pdf_') ? chatOrId.id.replace('pdf_', '') : null);
      targetChatId = chatOrId.id;
    } else if (typeof chatOrId === 'string') {
      const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
      const found = allConvs.find(c => c.id === chatOrId);
      if (found) {
        targetDocId = found.docId || (found.id.startsWith('pdf_') ? found.id.replace('pdf_', '') : null);
        targetChatId = found.id;
      } else if (chatOrId.startsWith('pdf_')) {
        targetDocId = chatOrId.replace('pdf_', '');
        targetChatId = chatOrId;
      } else {
        targetDocId = chatOrId;
        targetChatId = `pdf_${chatOrId}`;
      }
    }

    if (!targetDocId) return;

    state.activeDocId = targetDocId;
    localStorage.setItem('smartassist_active_pdf_id', targetDocId);
    if (targetChatId && window.setActiveChatId) {
      window.setActiveChatId(targetChatId, 'chat_with_pdf');
    }

    // Ensure documents are loaded
    if (!state.documents || state.documents.length === 0) {
      await loadDocuments();
    } else {
      await loadActiveDocumentDetails();
    }

    if (window.renderRecentChats) {
      window.renderRecentChats();
    }
  }

  function resetPdfWorkspace() {
    state.activeDocId = null;
    state.activeDoc = null;
    state.messages = [];
    state.isSuggestionsLoading = false;
    localStorage.removeItem('smartassist_active_pdf_id');
    if (window.setActiveChatId) {
      window.setActiveChatId(null, 'chat_with_pdf');
    }
    renderUI();
    if (window.renderRecentChats) {
      window.renderRecentChats();
    }
  }

  window.loadPdfConversationIntoView = loadPdfConversationIntoView;
  window.resetPdfWorkspace = resetPdfWorkspace;

  // ---------------------------------------------------------------------------
  // 12. Initialization
  // ---------------------------------------------------------------------------
  async function init() {
    cacheDom();
    attachEventHandlers();

    // Sync Auth session if Supabase is present
    if (window.SmartAssistAuth) {
      try {
        await window.SmartAssistAuth.init();
        const user = await window.SmartAssistAuth.getUser();
        state.currentUser = user;
        if (typeof window.SmartAssistAuth.syncAllAvatarsAndNames === 'function') {
          window.SmartAssistAuth.syncAllAvatarsAndNames();
        }
      } catch (e) {}
    }

    await loadDocuments();
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

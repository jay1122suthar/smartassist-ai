/**
 * SmartAssist AI — Fully Functional Sidebar Engine
 * Handles: Collapse/Expand, New Chat, Search, Dynamic Recent Chats,
 * Light/Dark Theme, Dock Toggle, and Profile Popover.
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Default Initial Sample Data (used only if no saved conversations exist)
  // --------------------------------------------------------------------------
  const DEFAULT_CONVERSATIONS = [
    {
      id: 'chat_os_revision',
      section: 'general_chat',
      title: 'Operating Systems Revision',
      timestamp: Date.now() - 3600000 * 2,
      messages: [
        {
          role: 'user',
          text: 'Explain the difference between a process and a thread in operating systems with a simple example.',
          time: '10:42 AM'
        },
        {
          role: 'model',
          text: 'A process is an executing instance of a program with its own dedicated memory space (PCB, stack, heap, data, text). A thread is a lightweight unit of execution within a process that shares the parent process\'s address space and resources.\n\n### Architectural Comparison\n* **Process Scope:** Heavy isolation. Owns PCB, registers, stack, heap, and file descriptors.\n* **Thread Scope:** Light execution. Shares text, data, and OS handles, maintaining private stacks.\n\n```python\nimport threading\nimport time\n\ndef background_task(task_name):\n    print(f"Thread {task_name}: running concurrently")\n    time.sleep(1)\n    print(f"Thread {task_name}: finished")\n\nt1 = threading.Thread(target=background_task, args=("Alpha",))\nt2 = threading.Thread(target=background_task, args=("Beta",))\nt1.start()\nt2.start()\nt1.join()\nt2.join()\nprint("Main process execution resumed")\n```\n\n**Key Takeaway:** Processes provide stronger isolation, while threads enable concurrent work within the same process.',
          time: '10:42 AM'
        }
      ]
    },
    {
      id: 'chat_python_debug',
      section: 'general_chat',
      title: 'Python Code Debugging',
      timestamp: Date.now() - 3600000 * 5,
      messages: [
        {
          role: 'user',
          text: 'How do I fix a RecursionError in recursive tree traversal in Python?',
          time: '09:15 AM'
        },
        {
          role: 'model',
          text: 'To resolve a `RecursionError: maximum recursion depth exceeded` in Python:\n\n1. **Verify your base case:** Ensure nodes with `None` children return immediately.\n2. **Use an iterative approach:** Replace recursive stack frames with an explicit stack `stack = [root]`.\n3. **Increase limit if legitimate:** `import sys; sys.setrecursionlimit(2000)`.\n\n```python\ndef iterative_traversal(root):\n    if not root: return []\n    stack, result = [root], []\n    while stack:\n        node = stack.pop()\n        if node:\n            result.append(node.val)\n            if node.right: stack.append(node.right)\n            if node.left: stack.append(node.left)\n    return result\n```',
          time: '09:15 AM'
        }
      ]
    },
    {
      id: 'chat_db_norm',
      section: 'general_chat',
      title: 'Database Normalization',
      timestamp: Date.now() - 3600000 * 12,
      messages: [
        {
          role: 'user',
          text: 'What are the main differences between 3NF and BCNF with a quick example?',
          time: 'Yesterday'
        },
        {
          role: 'model',
          text: 'The key distinction lies in functional dependencies with non-trivial determinants:\n\n* **3NF (Third Normal Form):** For every $X \\to Y$, either $X$ is a superkey OR $Y$ is a prime attribute (part of a candidate key).\n* **BCNF (Boyce-Codd Normal Form):** For every $X \\to Y$, $X$ **must** strictly be a superkey. There is no exception for prime attributes.\n\nBCNF eliminates anomalies where a key attribute depends on a non-superkey determinant.',
          time: 'Yesterday'
        }
      ]
    },
    {
      id: 'chat_ml_basics',
      section: 'general_chat',
      title: 'Machine Learning Basics',
      timestamp: Date.now() - 3600000 * 24,
      messages: [
        {
          role: 'user',
          text: 'Can you summarize the bias-variance tradeoff simply?',
          time: '2 days ago'
        },
        {
          role: 'model',
          text: 'The bias-variance tradeoff describes the tension between two sources of error in supervised models:\n\n* **High Bias (Underfitting):** The model is too simple and fails to capture underlying patterns.\n* **High Variance (Overfitting):** The model is overly complex, capturing noise and failing to generalize to unseen test data.\n\nOptimal generalization occurs where total error (Bias² + Variance + Irreducible Error) is minimized.',
          time: '2 days ago'
        }
      ]
    }
  ];

  // --------------------------------------------------------------------------
  // Section Identification
  // --------------------------------------------------------------------------
  function getCurrentSection() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('03_study_assistant') || path.includes('study-assistant')) {
      return 'study_assistant';
    }
    if (path.includes('05_chat_with_pdf') || path.includes('chat-with-pdf')) {
      return 'chat_with_pdf';
    }
    if (path.includes('04_code_assistant') || path.includes('code-assistant')) {
      return 'code_assistant';
    }
    // Default for 01_main_chat_dashboard, 02_active_conversation, 06_settings, etc.
    return 'general_chat';
  }

  // --------------------------------------------------------------------------
  // Storage API & State Management
  // --------------------------------------------------------------------------
  function getStoredConversations() {
    try {
      const raw = localStorage.getItem('smartassist_conversations');
      let parsed = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (_) {}
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        saveStoredConversations(DEFAULT_CONVERSATIONS, false);
        return DEFAULT_CONVERSATIONS;
      }

      // Safe migration: ensure every conversation has a section identifier
      let migrated = false;
      parsed.forEach(c => {
        if (!c.section) {
          if (c.studyParams || (c.id && String(c.id).startsWith('study_'))) {
            c.section = 'study_assistant';
          } else if (c.docId || c.filename || (c.id && String(c.id).startsWith('pdf_'))) {
            c.section = 'chat_with_pdf';
          } else if (c.codeParams || (c.id && String(c.id).startsWith('code_'))) {
            c.section = 'code_assistant';
          } else {
            c.section = 'general_chat';
          }
          migrated = true;
        }
      });

      if (migrated) {
        saveStoredConversations(parsed, false);
      }
      return parsed;
    } catch (e) {
      console.warn('Resetting malformed conversations in localStorage:', e);
      saveStoredConversations(DEFAULT_CONVERSATIONS, false);
      return DEFAULT_CONVERSATIONS;
    }
  }

  function saveStoredConversations(list, syncRemote = true) {
    try {
      localStorage.setItem('smartassist_conversations', JSON.stringify(list));
      if (syncRemote) {
        syncConversationsToSupabase(list);
      }
    } catch (e) {
      console.error('Failed to save conversations to localStorage:', e);
    }
  }

  function getActiveChatId(section = getCurrentSection()) {
    let activeId = localStorage.getItem(`smartassist_active_chat_id_${section}`);
    if (!activeId && section === 'general_chat') {
      activeId = localStorage.getItem('smartassist_active_chat_id');
    }
    const convs = getStoredConversations().filter(c => (c.section || 'general_chat') === section);
    if (!activeId || !convs.some(c => c.id === activeId)) {
      activeId = convs.length > 0 ? convs[0].id : null;
      if (activeId) {
        localStorage.setItem(`smartassist_active_chat_id_${section}`, activeId);
        if (section === 'general_chat') {
          localStorage.setItem('smartassist_active_chat_id', activeId);
        }
      } else {
        localStorage.removeItem(`smartassist_active_chat_id_${section}`);
        if (section === 'general_chat') {
          localStorage.removeItem('smartassist_active_chat_id');
        }
      }
    }
    return activeId;
  }

  function setActiveChatId(id, section = getCurrentSection()) {
    if (id) {
      localStorage.setItem(`smartassist_active_chat_id_${section}`, id);
      if (section === 'general_chat') {
        localStorage.setItem('smartassist_active_chat_id', id);
      }
    } else {
      localStorage.removeItem(`smartassist_active_chat_id_${section}`);
      if (section === 'general_chat') {
        localStorage.removeItem('smartassist_active_chat_id');
      }
    }
  }

  // --------------------------------------------------------------------------
  // Supabase Persistence Sync
  // --------------------------------------------------------------------------
  async function syncConversationsToSupabase(list) {
    try {
      if (!window.SmartAssistAuth) return;
      const client = await window.SmartAssistAuth.getClient();
      const user = await window.SmartAssistAuth.getUser();
      if (!client || !user || !user.id || user.id === 'guest_user') return;

      if (!Array.isArray(list) || list.length === 0) return;

      // Sync latest 20 conversations to Supabase
      const toSync = list.slice(0, 20);
      for (const chat of toSync) {
        const payload = {
          id: chat.id,
          user_id: user.id,
          title: chat.title || 'New Conversation',
          messages: chat.messages || [],
          section: chat.section || 'general_chat',
          metadata: {
            docId: chat.docId || null,
            filename: chat.filename || null,
            studyParams: chat.studyParams || null
          },
          updated_at: new Date(chat.timestamp || Date.now()).toISOString()
        };

        const { error } = await client.from('chat_conversations').upsert(payload);
        if (error && error.message && error.message.includes('column')) {
          // If section/metadata columns are not yet in table, fallback to core fields
          delete payload.section;
          delete payload.metadata;
          await client.from('chat_conversations').upsert(payload).catch(() => {});
        }
      }
    } catch (e) {
      // Offline or network hiccup; local persistence ensures continuous operation
    }
  }

  async function deleteConversationFromSupabase(chatId) {
    try {
      if (!window.SmartAssistAuth) return;
      const client = await window.SmartAssistAuth.getClient();
      const user = await window.SmartAssistAuth.getUser();
      if (!client || !user || !user.id || user.id === 'guest_user') return;

      await client.from('chat_conversations')
        .delete()
        .eq('id', chatId)
        .eq('user_id', user.id);
    } catch (_) {}
  }

  async function syncAllConversationsFromSupabase() {
    try {
      if (!window.SmartAssistAuth) return;
      const client = await window.SmartAssistAuth.getClient();
      const user = await window.SmartAssistAuth.getUser();
      if (!client || !user || !user.id || user.id === 'guest_user') return;

      const { data, error } = await client
        .from('chat_conversations')
        .select('*')
        .eq('user_id', user.id);

      if (data && !error && data.length > 0) {
        const localConvs = getStoredConversations();
        let changed = false;

        data.forEach(remote => {
          const local = localConvs.find(c => c.id === remote.id);
          const section = remote.section || remote.metadata?.section || 'general_chat';
          const docId = remote.metadata?.docId || null;
          const filename = remote.metadata?.filename || null;
          const studyParams = remote.metadata?.studyParams || null;
          const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : Date.now();

          if (!local) {
            localConvs.push({
              id: remote.id,
              section: section,
              title: remote.title || 'Conversation',
              messages: remote.messages || [],
              docId,
              filename,
              studyParams,
              timestamp: remoteTime
            });
            changed = true;
          } else if (remoteTime > (local.timestamp || 0)) {
            local.title = remote.title;
            local.messages = remote.messages || [];
            local.section = section;
            if (docId) local.docId = docId;
            if (filename) local.filename = filename;
            if (studyParams) local.studyParams = studyParams;
            local.timestamp = remoteTime;
            changed = true;
          }
        });

        if (changed) {
          saveStoredConversations(localConvs, false);
          renderRecentChats();
        }
      }
    } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }


  // --------------------------------------------------------------------------
  // Theme & Density Management (Light / Dark / System & Comfortable / Compact)
  // --------------------------------------------------------------------------
  let systemThemeMedia = null;

  function handleSystemThemeChange(e) {
    const currentTheme = localStorage.getItem('smartassist_theme') || 'light';
    if (currentTheme === 'system') {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      updateThemeToggleUI('system');
    }
  }

  function initTheme() {
    const saved = localStorage.getItem('smartassist_theme') || 'light';
    if (!systemThemeMedia && window.matchMedia) {
      systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
      try {
        systemThemeMedia.addEventListener('change', handleSystemThemeChange);
      } catch (e) {
        systemThemeMedia.addListener(handleSystemThemeChange);
      }
    }
    applyTheme(saved, false);
  }

  function applyTheme(theme, save = true) {
    let effectiveDark = false;
    if (theme === 'dark') {
      effectiveDark = true;
    } else if (theme === 'system') {
      effectiveDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      effectiveDark = false;
    }

    if (effectiveDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    if (save) {
      localStorage.setItem('smartassist_theme', theme);
    }
    updateThemeToggleUI(theme);

    // Dispatch custom event for in-page listeners
    window.dispatchEvent(new CustomEvent('smartassist:themechange', { detail: { theme, isDark: effectiveDark } }));
  }

  function updateThemeToggleUI(theme) {
    const lightBtn = document.getElementById('theme-btn-light');
    const darkBtn = document.getElementById('theme-btn-dark');
    if (!lightBtn || !darkBtn) return;

    if (theme === 'dark') {
      darkBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-lowest shadow-sm text-on-surface font-label-sm text-label-sm transition-all font-semibold';
      lightBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-all';
    } else if (theme === 'system') {
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isDark) {
        darkBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-lowest shadow-sm text-on-surface font-label-sm text-label-sm transition-all font-semibold';
        lightBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-all';
      } else {
        lightBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-lowest shadow-sm text-on-surface font-label-sm text-label-sm transition-all font-semibold';
        darkBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-all';
      }
    } else {
      lightBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-lowest shadow-sm text-on-surface font-label-sm text-label-sm transition-all font-semibold';
      darkBtn.className = 'flex items-center gap-1 px-2 py-0.5 rounded-full text-on-surface-variant hover:text-on-surface font-label-sm text-label-sm transition-all';
    }
  }

  function initDensity() {
    const saved = localStorage.getItem('smartassist_density') || 'comfortable';
    applyDensity(saved, false);
  }

  function applyDensity(density, save = true) {
    const isCompact = density === 'compact';
    if (isCompact) {
      document.documentElement.classList.add('density-compact');
      document.body?.classList.add('density-compact');
    } else {
      document.documentElement.classList.remove('density-compact');
      document.body?.classList.remove('density-compact');
    }

    if (save) {
      localStorage.setItem('smartassist_density', density);
    }

    window.dispatchEvent(new CustomEvent('smartassist:densitychange', { detail: { density, isCompact } }));
  }

  function initHeaderModelBadge() {
    try {
      // Remove visible model-name badge from headers and UI globally
      document.getElementById('headerModelBadge')?.remove();
      document.getElementById('pageModelBadge')?.remove();

      document.querySelectorAll('header span, header div').forEach(el => {
        const text = el.textContent.trim();
        if (/^Gemini(\s|\b)/i.test(text) || text === 'Gemini Live' || text === '3.5 Flash') {
          const badgePill = el.closest('.rounded-full');
          if (badgePill && badgePill.parentElement) {
            badgePill.remove();
          } else {
            el.remove();
          }
        }
      });
    } catch (e) {}
  }


  // Cross-tab synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === 'smartassist_theme' && e.newValue) {
      applyTheme(e.newValue, false);
    } else if (e.key === 'smartassist_density' && e.newValue) {
      applyDensity(e.newValue, false);
    } else if (e.key === 'smartassist_conversations') {
      renderRecentChats();
    } else if (e.key && e.key.startsWith('smartassist_active_chat_id')) {
      renderRecentChats();
      if (window.location.pathname.includes('02_active_conversation')) {
        loadActiveConversationIntoView(getActiveChatId('general_chat'));
      }
    } else if (e.key === 'smartassist_settings' || e.key === 'smartassist_ai_model') {
      initHeaderModelBadge();
    }
  });

  // Expose global methods
  window.SmartAssistUI = {
    applyTheme,
    applyDensity,
    getTheme: () => localStorage.getItem('smartassist_theme') || 'light',
    getDensity: () => localStorage.getItem('smartassist_density') || 'comfortable',
    getCurrentSection,
    getStoredConversations,
    saveStoredConversations,
    getActiveChatId,
    setActiveChatId,
    renderRecentChats,
    selectConversation,
    startNewConversation
  };
  window.getCurrentSection = getCurrentSection;
  window.getStoredConversations = getStoredConversations;
  window.saveStoredConversations = saveStoredConversations;
  window.getActiveChatId = getActiveChatId;
  window.setActiveChatId = setActiveChatId;
  window.renderRecentChats = renderRecentChats;
  window.selectConversation = selectConversation;
  window.startNewConversation = startNewConversation;
  window.applyTheme = applyTheme;
  window.applyDensity = applyDensity;

  // --------------------------------------------------------------------------
  // Sidebar Collapse / Expand
  // --------------------------------------------------------------------------
  function initSidebarCollapse() {
    const isCollapsed = localStorage.getItem('smartassist_sidebar_collapsed') === 'true';
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    }
    updateCollapseIcons(isCollapsed);
  }

  function toggleSidebar(forceState) {
    const currentlyCollapsed = document.body.classList.contains('sidebar-collapsed');
    const nextState = forceState !== undefined ? forceState : !currentlyCollapsed;

    if (nextState) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }

    localStorage.setItem('smartassist_sidebar_collapsed', nextState ? 'true' : 'false');
    updateCollapseIcons(nextState);

    // Close profile popover if open when toggling
    hideProfilePopover();
  }

  function updateCollapseIcons(isCollapsed) {
    const topIcon = document.getElementById('sidebar-collapse-icon');
    const topBtn = document.getElementById('sidebar-collapse-btn');
    const dockIcon = document.getElementById('sidebar-dock-icon');
    const dockBtn = document.getElementById('sidebar-dock-btn');

    if (topIcon) {
      topIcon.textContent = isCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left';
    }
    if (topBtn) {
      topBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
      topBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
      topBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }

    if (dockIcon) {
      dockIcon.textContent = isCollapsed ? 'dock_to_right' : 'dock_to_left';
    }
    if (dockBtn) {
      dockBtn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
      dockBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
      dockBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }
  }

  // --------------------------------------------------------------------------
  // Recent Chats List & Deep Search (Titles + Message Content)
  // --------------------------------------------------------------------------
  function matchesSearch(chat, query) {
    if (!query) return true;
    const q = query.trim().toLowerCase();
    if (!q) return true;

    // 1. Search conversation title
    if (chat.title && chat.title.toLowerCase().includes(q)) {
      return true;
    }

    // 2. Search PDF filename
    if (chat.filename && chat.filename.toLowerCase().includes(q)) {
      return true;
    }

    // 3. Search Study params
    if (chat.studyParams) {
      if (chat.studyParams.subject && chat.studyParams.subject.toLowerCase().includes(q)) return true;
      if (chat.studyParams.topic && chat.studyParams.topic.toLowerCase().includes(q)) return true;
      if (chat.studyParams.mode && chat.studyParams.mode.toLowerCase().includes(q)) return true;
    }

    // 4. Search message content and attachment filenames where available
    if (Array.isArray(chat.messages)) {
      for (const msg of chat.messages) {
        if (msg && msg.text && msg.text.toLowerCase().includes(q)) {
          return true;
        }
        if (msg && msg.attachment && (msg.attachment.filename || msg.attachment.name)) {
          const fn = (msg.attachment.filename || msg.attachment.name).toLowerCase();
          if (fn.includes(q)) return true;
        }
      }
    }

    return false;
  }

  function renderRecentChats(filterQuery = '') {
    const container = document.getElementById('sidebar-recent-chats-list');
    const countEl = document.getElementById('sidebar-recent-count');
    if (!container) return;

    const currentSection = getCurrentSection();
    const allConvs = getStoredConversations();
    const sectionConvs = allConvs.filter(c => (c.section || 'general_chat') === currentSection);
    const activeId = getActiveChatId(currentSection);

    const q = (filterQuery || '').trim().toLowerCase();
    const filtered = q ? sectionConvs.filter(c => matchesSearch(c, q)) : sectionConvs;

    if (countEl) {
      countEl.textContent = q ? `${filtered.length} / ${sectionConvs.length}` : sectionConvs.length;
    }

    if (filtered.length === 0) {
      if (q) {
        container.innerHTML = `
          <div class="px-space-md py-6 text-center flex flex-col items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant/70 mb-2">
              <span class="material-symbols-outlined text-[20px]">search_off</span>
            </div>
            <p class="font-label-md text-label-md font-medium text-on-surface">No matching conversations</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 max-w-[180px]">No chats found matching "${escapeHtml(filterQuery.trim())}". Try a different keyword.</p>
          </div>
        `;
      } else if (currentSection === 'study_assistant') {
        container.innerHTML = `
          <div class="px-space-md py-6 text-center flex flex-col items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary mb-2">
              <span class="material-symbols-outlined text-[20px]">school</span>
            </div>
            <p class="font-label-md text-label-md font-medium text-on-surface">No study sessions</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 max-w-[180px]">Explain a topic, summarize notes, or generate an MCQ quiz to build your study history.</p>
          </div>
        `;
      } else if (currentSection === 'chat_with_pdf') {
        container.innerHTML = `
          <div class="px-space-md py-6 text-center flex flex-col items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-red-500 mb-2">
              <span class="material-symbols-outlined text-[20px]">picture_as_pdf</span>
            </div>
            <p class="font-label-md text-label-md font-medium text-on-surface">No PDF chats</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 max-w-[180px]">Upload or select a PDF document to begin asking grounded questions.</p>
          </div>
        `;
      } else if (currentSection === 'code_assistant') {
        container.innerHTML = `
          <div class="px-space-md py-6 text-center flex flex-col items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary mb-2">
              <span class="material-symbols-outlined text-[20px]">terminal</span>
            </div>
            <p class="font-label-md text-label-md font-medium text-on-surface">No code sessions</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 max-w-[180px]">Analyze, debug, or optimize code in the editor to save coding sessions.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="px-space-md py-6 text-center flex flex-col items-center justify-center">
            <div class="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant/70 mb-2">
              <span class="material-symbols-outlined text-[20px]">chat_bubble_outline</span>
            </div>
            <p class="font-label-md text-label-md font-medium text-on-surface">No recent chats</p>
            <p class="font-body-sm text-body-sm text-on-surface-variant/80 mt-1 max-w-[180px]">Start a new conversation to ask questions or discuss coursework.</p>
          </div>
        `;
      }
      return;
    }

    container.innerHTML = '';
    filtered.forEach(chat => {
      const isActive = chat.id === activeId;
      const activeClass = isActive
        ? 'bg-secondary-container text-primary font-semibold shadow-xs'
        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface';

      const item = document.createElement('div');
      item.className = `group flex items-center justify-between px-space-sm py-1.5 rounded-lg cursor-pointer transition-colors ${activeClass}`;
      item.setAttribute('data-chat-id', chat.id);
      item.title = chat.title;

      let sectionBadgeHtml = '';
      let sectionIcon = 'history';

      if (currentSection === 'chat_with_pdf') {
        sectionIcon = 'description';
        if (chat.filename) {
          sectionBadgeHtml = `
            <div class="flex items-center gap-1 text-[11px] text-on-surface-variant/80 truncate mt-0.5">
              <span class="material-symbols-outlined text-[12px] text-red-500 shrink-0">picture_as_pdf</span>
              <span class="truncate">${escapeHtml(chat.filename)}</span>
            </div>
          `;
        }
      } else if (currentSection === 'study_assistant') {
        sectionIcon = 'school';
        if (chat.studyParams && (chat.studyParams.subject || chat.studyParams.mode)) {
          const sub = chat.studyParams.subject || 'CS';
          const mod = chat.studyParams.mode || 'study';
          sectionBadgeHtml = `
            <div class="flex items-center gap-1 text-[11px] text-on-surface-variant/80 truncate mt-0.5">
              <span class="material-symbols-outlined text-[12px] text-primary shrink-0">menu_book</span>
              <span class="truncate">${escapeHtml(sub)} • ${escapeHtml(mod)}</span>
            </div>
          `;
        }
      } else if (currentSection === 'code_assistant') {
        sectionIcon = 'terminal';
      }

      item.innerHTML = `
        <div class="flex items-start gap-space-xs min-w-0 flex-1">
          <span class="material-symbols-outlined text-[16px] shrink-0 mt-0.5 ${isActive ? 'text-primary' : 'text-on-surface-variant'}">${sectionIcon}</span>
          <div class="flex flex-col min-w-0 flex-1">
            <span class="font-body-sm text-body-sm truncate">${escapeHtml(chat.title)}</span>
            ${sectionBadgeHtml}
          </div>
        </div>
        <button class="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-container-high rounded text-on-surface-variant transition-opacity shrink-0" type="button" title="Chat Options">
          <span class="material-symbols-outlined text-[16px]">more_vert</span>
        </button>
      `;

      item.addEventListener('click', (e) => {
        // If clicking more_vert, open options menu instead of switching chat
        if (e.target.closest('button')) {
          e.stopPropagation();
          showChatOptionsMenu(chat.id, e.target.closest('button'), e);
          return;
        }
        selectConversation(chat.id);
      });

      container.appendChild(item);
    });
  }

  function selectConversation(id) {
    const allConvs = getStoredConversations();
    const chat = allConvs.find(c => c.id === id);
    if (!chat) return;

    const section = chat.section || 'general_chat';
    setActiveChatId(id, section);
    renderRecentChats();

    if (section === 'general_chat') {
      const isChatPage = window.location.pathname.includes('02_active_conversation');
      if (isChatPage) {
        loadActiveConversationIntoView(id);
      } else {
        window.location.href = '../02_active_conversation/code.html';
      }
    } else if (section === 'study_assistant') {
      const isStudyPage = window.location.pathname.includes('03_study_assistant');
      if (isStudyPage && typeof window.loadStudySessionIntoView === 'function') {
        window.loadStudySessionIntoView(chat);
      } else {
        window.location.href = `../03_study_assistant/code.html?session=${encodeURIComponent(id)}`;
      }
    } else if (section === 'chat_with_pdf') {
      const isPdfPage = window.location.pathname.includes('05_chat_with_pdf');
      if (isPdfPage && typeof window.loadPdfConversationIntoView === 'function') {
        window.loadPdfConversationIntoView(chat);
      } else {
        const docParam = chat.docId ? `docId=${encodeURIComponent(chat.docId)}&` : '';
        window.location.href = `../05_chat_with_pdf/code.html?${docParam}chatId=${encodeURIComponent(id)}`;
      }
    } else if (section === 'code_assistant') {
      const isCodePage = window.location.pathname.includes('04_code_assistant');
      if (isCodePage && typeof window.restoreSession === 'function') {
        window.restoreSession(id);
      } else {
        window.location.href = `../04_code_assistant/code.html?session=${encodeURIComponent(id)}`;
      }
    }
  }

  function startNewConversation() {
    const section = getCurrentSection();
    const allConvs = getStoredConversations();

    if (section === 'general_chat') {
      const isDashboard = window.location.pathname.includes('01_main_chat_dashboard');
      const isChatPage = window.location.pathname.includes('02_active_conversation');

      // Clean out empty conversations in general_chat
      const cleaned = allConvs.filter(c => c.section !== 'general_chat' || (c.messages && c.messages.length > 0));
      const newId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newChat = {
        id: newId,
        section: 'general_chat',
        title: 'New Conversation',
        timestamp: Date.now(),
        messages: []
      };

      cleaned.unshift(newChat);
      saveStoredConversations(cleaned);
      setActiveChatId(newId, 'general_chat');

      if (isDashboard) {
        const input = document.getElementById('mainInput');
        if (input) {
          input.value = '';
          input.focus();
        }
        sessionStorage.removeItem('pendingPrompt');
        renderRecentChats();
      } else if (isChatPage) {
        renderRecentChats();
        loadActiveConversationIntoView(newId);
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
          chatInput.value = '';
          chatInput.focus();
        }
      } else {
        window.location.href = '../01_main_chat_dashboard/code.html';
      }
    } else if (section === 'study_assistant') {
      const isStudyPage = window.location.pathname.includes('03_study_assistant');
      if (isStudyPage) {
        if (typeof window.resetStudyWorkspace === 'function') {
          window.resetStudyWorkspace();
        }
        setActiveChatId(null, 'study_assistant');
        renderRecentChats();
        const subjectInput = document.getElementById('subjectInput');
        if (subjectInput) {
          subjectInput.focus();
        }
      } else {
        window.location.href = '../03_study_assistant/code.html';
      }
    } else if (section === 'chat_with_pdf') {
      const isPdfPage = window.location.pathname.includes('05_chat_with_pdf');
      if (isPdfPage) {
        if (typeof window.resetPdfWorkspace === 'function') {
          window.resetPdfWorkspace();
        }
        setActiveChatId(null, 'chat_with_pdf');
        renderRecentChats();
      } else {
        window.location.href = '../05_chat_with_pdf/code.html';
      }
    } else if (section === 'code_assistant') {
      const isCodePage = window.location.pathname.includes('04_code_assistant');
      if (isCodePage) {
        if (typeof window.startNewCodingSession === 'function') {
          window.startNewCodingSession();
        }
        setActiveChatId(null, 'code_assistant');
        renderRecentChats();
      } else {
        window.location.href = '../04_code_assistant/code.html';
      }
    }
  }

  window.startNewConversationId = function (firstPrompt) {
    const allConvs = getStoredConversations();
    const cleaned = allConvs.filter(c => c.section !== 'general_chat' || (c.messages && c.messages.length > 0));
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const trimmed = firstPrompt ? firstPrompt.trim().replace(/^[\r\n]+/, '') : 'New Conversation';
    const title = trimmed.length > 35 ? trimmed.substring(0, 35) + '…' : trimmed;
    const newChat = {
      id: newId,
      section: 'general_chat',
      title: title || 'New Conversation',
      timestamp: Date.now(),
      messages: []
    };
    cleaned.unshift(newChat);
    saveStoredConversations(cleaned);
    setActiveChatId(newId, 'general_chat');
    return newId;
  };

  function loadActiveConversationIntoView(chatId) {
    const convs = getStoredConversations();
    const current = convs.find(c => c.id === chatId);
    const container = document.getElementById('chat-flow-container');
    if (!container || !current) return;

    // Sync active conversation history for the chat API
    if (Array.isArray(current.messages)) {
      window.conversationHistory = current.messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        text: m.text
      }));
    } else {
      window.conversationHistory = [];
    }

    // Update header thread title if present
    const threadTitleEl = document.querySelector('.font-body-sm.text-body-sm.font-medium.text-on-surface.truncate');
    if (threadTitleEl) {
      threadTitleEl.textContent = `Thread: ${current.title}`;
    }

    container.innerHTML = '';

    if (!current.messages || current.messages.length === 0) {
      // Clean empty state for new conversations
      container.innerHTML = `
        <div class="max-w-xl mx-auto py-12 text-center flex flex-col items-center">
          <div class="w-14 h-14 rounded-2xl bg-primary-container/10 text-primary flex items-center justify-center mb-4">
            <span class="material-symbols-outlined text-[32px]">neurology</span>
          </div>
          <h2 class="font-headline-lg text-headline-lg text-on-surface tracking-tight">New Conversation</h2>
          <p class="font-body-md text-body-md text-on-surface-variant mt-2 max-w-md">
            Ask SmartAssist anything about systems programming, data structures, algorithms, or computer science coursework.
          </p>
          <div class="flex flex-wrap gap-2 mt-6 justify-center">
            <button class="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-colors" type="button" onclick="document.getElementById('chat-input').value='Explain Dijkstra\\'s shortest path algorithm with time complexity.'; document.getElementById('chat-input').focus();">
              Dijkstra's Algorithm
            </button>
            <button class="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-colors" type="button" onclick="document.getElementById('chat-input').value='What are ACID properties in database transactions?'; document.getElementById('chat-input').focus();">
              ACID Properties
            </button>
            <button class="px-3 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm transition-colors" type="button" onclick="document.getElementById('chat-input').value='Debug a deadlock in multithreaded C++ code.'; document.getElementById('chat-input').focus();">
              Debug Deadlock
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Determine current user display name
    let userDisplayName = 'User';
    try {
      const stored = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.name) userDisplayName = u.name;
        else if (u.email) userDisplayName = u.email.split('@')[0];
      }
    } catch (e) {}
    const initials = (userDisplayName.slice(0, 2)).toUpperCase();

    // Render messages for current conversation
    current.messages.forEach(msg => {
      if (msg.role === 'user') {
        let attachmentBadgeHtml = '';
        if (msg.attachment) {
          const attName = msg.attachment.filename || msg.attachment.name || 'Attached File';
          const ext = (attName.split('.').pop() || '').toLowerCase();
          const isPdf = ext === 'pdf';
          const icon = isPdf ? 'picture_as_pdf' : (['py', 'js', 'ts', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'sh'].includes(ext) ? 'terminal' : 'description');
          const sizeStr = typeof window.SmartAssistComposer?.formatBytes === 'function' ? window.SmartAssistComposer.formatBytes(msg.attachment.size) : '';
          const pagesStr = isPdf && msg.attachment.pages ? `${msg.attachment.pages} pages` : '';
          const metaStr = [sizeStr, pagesStr].filter(Boolean).join(' • ');

          attachmentBadgeHtml = `
            <div class="mb-2 p-2 rounded-xl bg-black/15 border border-white/20 flex items-center gap-2.5 max-w-sm">
              <div class="w-8 h-8 rounded-lg ${isPdf ? 'bg-red-500/25 text-red-100' : 'bg-white/20 text-white'} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[18px]">${icon}</span>
              </div>
              <div class="flex flex-col min-w-0 text-left">
                <span class="font-label-md text-label-md text-white font-medium truncate" title="${escapeHtml(attName)}">${escapeHtml(attName)}</span>
                ${metaStr ? `<span class="font-code-sm text-code-sm text-white/75">${escapeHtml(metaStr)}</span>` : ''}
              </div>
            </div>
          `;
        }

        const userHtml = `
          <div class="flex justify-end w-full user-message-wrapper">
            <div class="flex items-start gap-space-sm max-w-2xl w-full justify-end">
              <div class="flex flex-col items-end gap-1.5 w-full">
                <div class="flex items-center gap-2 px-1">
                  <span class="font-label-md text-label-md text-on-surface font-semibold">${escapeHtml(userDisplayName)}</span>
                  <span class="font-code-sm text-code-sm text-on-surface-variant">${escapeHtml(msg.time || formatTime())}</span>
                </div>
                <div class="p-space-md rounded-2xl rounded-tr-xs bg-primary-container text-on-primary-container shadow-md shadow-primary-container/20 w-auto">
                  ${attachmentBadgeHtml}
                  ${msg.text ? `<p class="font-body-md text-body-md text-on-primary-container leading-relaxed whitespace-pre-wrap">${escapeHtml(msg.text)}</p>` : ''}
                </div>
                <div class="flex items-center gap-2 text-on-surface-variant font-code-sm text-code-sm px-1">
                  <span class="material-symbols-outlined text-[14px] text-primary">done_all</span>
                  <span>Synthesized</span>
                </div>
              </div>
              <div class="w-10 h-10 rounded-full bg-primary text-white font-semibold flex items-center justify-center text-xs shrink-0 ring-2 ring-primary-container/30 shadow-sm mt-0.5 select-none">
                ${escapeHtml(initials)}
              </div>
            </div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', userHtml);
      } else {
        let citationsHtml = '';
        if (msg.citations && msg.citations.length > 0) {
          citationsHtml = `
            <div class="mt-3 pt-3 border-t border-outline-variant/20 flex flex-wrap items-center gap-1.5">
              <span class="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-semibold mr-1">Sources &amp; Citations:</span>
              ${msg.citations.map(c => `
                <a href="/api/pdf/document/${msg.attachment?.id || ''}/view#page=${c.page}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-code-sm text-code-sm transition-colors border border-primary/20 shadow-xs" title="Open source PDF at ${escapeHtml(c.label)}">
                  <span class="material-symbols-outlined text-[13px]">menu_book</span>
                  <span>${escapeHtml(c.label)}</span>
                </a>
              `).join('')}
            </div>
          `;
        }

        let scannedNoticeHtml = '';
        if (msg.isScanned) {
          scannedNoticeHtml = `
            <div class="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
              <span class="material-symbols-outlined text-[16px] text-amber-600 shrink-0">info</span>
              <span>This PDF appears to be scanned or image-based with no extractable text. OCR would be required to analyze its contents.</span>
            </div>
          `;
        }

        const aiHtml = `
          <div class="flex items-start gap-space-md w-full ai-response-card">
            <div class="relative shrink-0 mt-1">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-primary-container p-0.5 shadow-lg shadow-primary/25 flex items-center justify-center text-white">
                <span class="material-symbols-outlined text-[22px]" style="font-variation-settings: 'FILL' 1;">neurology</span>
              </div>
              <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-surface-container-lowest flex items-center justify-center shadow-xs">
                <span class="material-symbols-outlined text-[11px] text-primary-container">auto_awesome</span>
              </div>
            </div>
            <div class="flex flex-col flex-1 min-w-0 bg-surface-container-lowest rounded-2xl shadow-sm p-space-lg space-y-space-md">
              <div class="flex items-center justify-between pb-space-xs">
                <div class="flex items-center gap-space-sm">
                  <span class="font-title-md text-title-md text-on-surface font-semibold">SmartAssist AI</span>
                  <span class="font-code-sm text-code-sm text-on-surface-variant flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Verified
                  </span>
                </div>
                <span class="font-code-sm text-code-sm text-on-surface-variant">${escapeHtml(msg.time || '10:42 AM')}</span>
              </div>
              <div class="ai-rendered-content space-y-2 text-on-surface">
                ${typeof window.renderMarkdown === 'function' ? window.renderMarkdown(msg.text) : escapeHtml(msg.text)}
              </div>
              ${scannedNoticeHtml}
              ${citationsHtml}
              <div class="flex items-center gap-1.5 pt-space-xs">
                <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md shadow-xs active:scale-95" type="button" onclick="navigator.clipboard.writeText(this.closest('.ai-response-card').querySelector('.ai-rendered-content').innerText); this.querySelector('span:last-child').textContent='Copied!'; setTimeout(() => this.querySelector('span:last-child').textContent='Copy Response', 1500);">
                  <span class="material-symbols-outlined text-[16px]">content_copy</span>
                  <span>Copy Response</span>
                </button>
              </div>
            </div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', aiHtml);
      }
    });

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  // Hook for Chat Script to record new messages in active conversation
  window.recordConversationMessage = function (role, text, metadata = {}, targetSection = null) {
    const section = targetSection || getCurrentSection();
    const activeId = getActiveChatId(section);
    const convs = getStoredConversations();
    let current = convs.find(c => c.id === activeId);

    if (!current) {
      current = {
        id: activeId || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        section: section,
        title: 'New Conversation',
        timestamp: Date.now(),
        messages: []
      };
      convs.unshift(current);
    } else {
      current.section = current.section || section;
    }

    // Auto-update conversation title from first user query or attachment
    if (role === 'user' && (current.title === 'New Conversation' || !current.title)) {
      const source = text || metadata.attachment?.filename || metadata.attachment?.name || 'New Conversation';
      const trimmed = source.trim().replace(/^[\r\n]+/, '');
      const maxLen = 30;
      current.title = trimmed.length > maxLen ? trimmed.substring(0, maxLen) + '…' : trimmed;
    }

    current.messages.push({
      role: role === 'assistant' ? 'model' : role,
      text: text,
      attachment: metadata.attachment || null,
      citations: metadata.citations || null,
      isScanned: metadata.isScanned || false,
      time: formatTime()
    });

    current.timestamp = Date.now();

    // Reorder conversation to top of list
    const filteredConvs = convs.filter(c => c.id !== current.id);
    filteredConvs.unshift(current);
    saveStoredConversations(filteredConvs);

    // Re-render sidebar list
    renderRecentChats();
  };

  function showChatOptionsMenu(chatId, triggerEl, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const existing = document.getElementById('chat-options-popover');
    if (existing) {
      const prevId = existing.getAttribute('data-chat-id');
      existing.remove();
      if (prevId === chatId) return;
    }

    const allConvs = getStoredConversations();
    const chat = allConvs.find(c => c.id === chatId);
    if (!chat) return;

    const rect = triggerEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'chat-options-popover';
    menu.setAttribute('data-chat-id', chatId);
    menu.className = 'fixed z-50 bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-xl py-1 w-44 text-on-surface text-sm animate-in fade-in zoom-in-95 duration-100';

    let top = rect.bottom + 4;
    let left = Math.min(rect.left, window.innerWidth - 180);
    if (top + 100 > window.innerHeight) {
      top = Math.max(10, rect.top - 84);
    }
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    menu.innerHTML = `
      <button type="button" class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-container text-on-surface font-label-md transition-colors" id="btn-rename-chat">
        <span class="material-symbols-outlined text-[16px] text-primary">edit</span>
        <span>Rename</span>
      </button>
      <button type="button" class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-error-container/20 text-error font-label-md transition-colors" id="btn-delete-chat">
        <span class="material-symbols-outlined text-[16px]">delete</span>
        <span>Delete</span>
      </button>
    `;

    document.body.appendChild(menu);

    const onOutsideClick = (e) => {
      if (!menu.contains(e.target) && e.target !== triggerEl && !triggerEl.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', onOutsideClick);
      }
    };
    setTimeout(() => document.addEventListener('click', onOutsideClick), 10);

    document.getElementById('btn-rename-chat')?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      promptRenameChat(chatId);
    });

    document.getElementById('btn-delete-chat')?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      promptDeleteChat(chatId);
    });
  }

  function promptRenameChat(chatId) {
    const allConvs = getStoredConversations();
    const chat = allConvs.find(c => c.id === chatId);
    if (!chat) return;

    const newTitle = prompt('Enter new conversation title:', chat.title);
    if (newTitle === null) return;

    const trimmed = newTitle.trim();
    if (!trimmed) {
      alert('Conversation title cannot be empty.');
      return;
    }

    chat.title = trimmed;
    chat.timestamp = Date.now();
    saveStoredConversations(allConvs);
    renderRecentChats();

    // If currently active chat was renamed, update header thread title if on chat page
    const threadTitleEl = document.querySelector('.font-body-sm.text-body-sm.font-medium.text-on-surface.truncate');
    if (threadTitleEl && getActiveChatId(chat.section) === chatId) {
      threadTitleEl.textContent = `Thread: ${chat.title}`;
    }
  }

  function promptDeleteChat(chatId) {
    const allConvs = getStoredConversations();
    const chat = allConvs.find(c => c.id === chatId);
    if (!chat) return;

    const confirmed = confirm(`Are you sure you want to delete "${chat.title}"?\n\nThis conversation will be permanently removed.`);
    if (!confirmed) return;

    const section = chat.section || 'general_chat';
    const remaining = allConvs.filter(c => c.id !== chatId);
    saveStoredConversations(remaining);
    deleteConversationFromSupabase(chatId);

    // If active conversation was deleted, pick the next one or trigger new conversation
    if (getActiveChatId(section) === chatId) {
      const remainingInSection = remaining.filter(c => (c.section || 'general_chat') === section);
      if (remainingInSection.length > 0) {
        setActiveChatId(remainingInSection[0].id, section);
        if (getCurrentSection() === section) {
          selectConversation(remainingInSection[0].id);
        }
      } else {
        localStorage.removeItem(`smartassist_active_chat_id_${section}`);
        if (section === 'general_chat') {
          localStorage.removeItem('smartassist_active_chat_id');
        }
        if (getCurrentSection() === section) {
          startNewConversation();
        }
      }
    }

    renderRecentChats();
  }


  // --------------------------------------------------------------------------
  // Profile Popover & Profile Modal
  // --------------------------------------------------------------------------
  function createProfilePopoverDOM() {
    let popover = document.getElementById('sidebar-profile-popover');
    if (!popover) {
      let activeUser = { name: 'User', email: 'user@university.edu' };
      try {
        const stored = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.name) activeUser.name = parsed.name;
          if (parsed.email) activeUser.email = parsed.email;
        }
      } catch (e) {}

      popover = document.createElement('div');
      popover.id = 'sidebar-profile-popover';
      popover.innerHTML = `
        <div class="p-2 border-b border-surface-container-high/60">
          <div class="font-label-md text-label-md font-semibold text-on-surface truncate">${activeUser.name}</div>
          <div class="font-code-sm text-code-sm text-on-surface-variant truncate">${activeUser.email}</div>
          <div class="inline-flex items-center gap-1 px-1.5 py-0.5 mt-1 rounded bg-secondary-container text-primary font-code-sm text-[11px]">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Verified Auth Session</span>
          </div>
        </div>
        <div class="py-1">
          <button class="profile-popover-item" type="button" id="popover-profile-btn">
            <span class="material-symbols-outlined text-[18px] text-primary">account_circle</span>
            <span>Profile Details</span>
          </button>
          <button class="profile-popover-item" type="button" id="popover-settings-btn">
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">settings</span>
            <span>Settings & Preferences</span>
          </button>
          <div class="my-1 border-t border-surface-container-high/60"></div>
          <button class="profile-popover-item text-error hover:bg-error-container/20" type="button" id="popover-signout-btn">
            <span class="material-symbols-outlined text-[18px] text-error">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      `;
      document.body.appendChild(popover);

      // Attach popover item listeners
      document.getElementById('popover-profile-btn')?.addEventListener('click', () => {
        hideProfilePopover();
        showProfileModal();
      });

      document.getElementById('popover-settings-btn')?.addEventListener('click', () => {
        hideProfilePopover();
        window.location.href = '../06_settings/code.html';
      });

      document.getElementById('popover-signout-btn')?.addEventListener('click', async () => {
        hideProfilePopover();
        const conf = confirm('Sign out of your SmartAssist AI session?');
        if (conf) {
          if (window.SmartAssistAuth?.signOut) {
            await window.SmartAssistAuth.signOut();
          } else {
            localStorage.removeItem('smartassist_user');
            localStorage.removeItem('smartassist_session');
            sessionStorage.clear();
            window.location.href = '../09_sign_in/code.html';
          }
        }
      });
    }

    // Modal DOM
    let modal = document.getElementById('smartassist-profile-modal');
    if (!modal) {
      let activeUser = { name: 'User', email: 'user@university.edu' };
      try {
        const stored = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.name) activeUser.name = parsed.name;
          if (parsed.email) activeUser.email = parsed.email;
        }
      } catch (e) {}

      modal = document.createElement('div');
      modal.id = 'smartassist-profile-modal';
      modal.innerHTML = `
        <div class="bg-surface-container-lowest max-w-md w-full rounded-2xl p-6 shadow-2xl border border-surface-container-high relative">
          <div class="flex items-center justify-between pb-4 border-b border-surface-container-high">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-primary text-white font-semibold flex items-center justify-center text-sm ring-2 ring-primary-container/30">
                ${(activeUser.name ? activeUser.name.slice(0, 2) : 'US').toUpperCase()}
              </div>
              <div class="min-w-0">
                <h3 class="font-title-md text-title-md font-semibold text-on-surface truncate">${activeUser.name}</h3>
                <span class="font-code-sm text-code-sm text-on-surface-variant truncate">${activeUser.email}</span>
              </div>
            </div>
            <button class="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors" type="button" id="close-profile-modal-btn">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div class="py-4 space-y-3 font-body-sm text-body-sm">
            <div class="flex justify-between py-1 border-b border-surface-container/50">
              <span class="text-on-surface-variant">Auth Provider</span>
              <span class="font-medium text-on-surface">Supabase Auth</span>
            </div>
            <div class="flex justify-between py-1 border-b border-surface-container/50">
              <span class="text-on-surface-variant">Account Security</span>
              <span class="font-medium text-emerald-600">Verified Email</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-on-surface-variant">Edit Profile</span>
              <a href="../06_settings/code.html" class="text-primary hover:underline font-medium">Open Settings</a>
            </div>
          </div>
          <div class="pt-2 flex justify-end gap-2">
            <button class="px-4 py-2 rounded-xl bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors" type="button" id="close-profile-modal-btn-2">
              Close
            </button>
            <a href="../06_settings/code.html" class="px-4 py-2 rounded-xl bg-primary-container text-on-primary-container font-label-md text-label-md hover:bg-primary transition-all">
              Manage Profile
            </a>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('close-profile-modal-btn-2')?.addEventListener('click', hideProfileModal);

      document.getElementById('close-profile-modal-btn')?.addEventListener('click', hideProfileModal);
      document.getElementById('confirm-profile-modal-btn')?.addEventListener('click', hideProfileModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) hideProfileModal();
      });
    }
  }

  function toggleProfilePopover() {
    const popover = document.getElementById('sidebar-profile-popover');
    if (!popover) return;
    if (popover.style.display === 'block') {
      hideProfilePopover();
    } else {
      popover.style.display = 'block';
    }
  }

  function hideProfilePopover() {
    const popover = document.getElementById('sidebar-profile-popover');
    if (popover) popover.style.display = 'none';
  }

  function showProfileModal() {
    const modal = document.getElementById('smartassist-profile-modal');
    if (modal) modal.style.display = 'flex';
  }

  function hideProfileModal() {
    const modal = document.getElementById('smartassist-profile-modal');
    if (modal) modal.style.display = 'none';
  }

  // --------------------------------------------------------------------------
  // DOM Binding & Initialization
  // --------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Theme & Density (runs everywhere)
    initTheme();
    initDensity();
    initHeaderModelBadge();

    // Primary navigation sidebar
    const mainSidebar = document.querySelector('aside.fixed.left-0') || document.querySelector('aside');
    if (!mainSidebar) return;

    const allButtons = Array.from(mainSidebar.querySelectorAll('button'));

    // 2. Attach Top Double Chevron Button
    const topChevronBtn = allButtons.find(b => {
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      return text.includes('keyboard_double_arrow');
    });
    if (topChevronBtn) {
      topChevronBtn.id = 'sidebar-collapse-btn';
      topChevronBtn.setAttribute('aria-label', 'Collapse sidebar');
      topChevronBtn.setAttribute('aria-expanded', 'true');
      topChevronBtn.title = 'Collapse sidebar';
      const icon = topChevronBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.id = 'sidebar-collapse-icon';

      topChevronBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSidebar();
      });
      topChevronBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSidebar();
        }
      });
    }

    // 3. Attach Bottom Dock Button (dock_to_left or dock_to_right)
    const dockBtn = allButtons.find(b => {
      if (b === topChevronBtn) return false;
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      const title = b.getAttribute('title') || '';
      return text.includes('dock_to_') || (title.toLowerCase().includes('sidebar') && b !== topChevronBtn);
    });
    if (dockBtn) {
      dockBtn.id = 'sidebar-dock-btn';
      dockBtn.setAttribute('aria-label', 'Collapse sidebar');
      dockBtn.setAttribute('aria-expanded', 'true');
      dockBtn.title = 'Collapse sidebar';
      const icon = dockBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.id = 'sidebar-dock-icon';

      dockBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleSidebar();
      });
      dockBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSidebar();
        }
      });
    }

    // 4. Initialize Sidebar Collapsed State (now that collapse & dock elements have IDs)
    initSidebarCollapse();

    // 5. Attach New Chat Button
    const newChatBtn = allButtons.find(b =>
      b.textContent.includes('New Chat') ||
      b.querySelector('.material-symbols-outlined')?.textContent.trim() === 'add'
    );
    if (newChatBtn) {
      newChatBtn.id = 'sidebar-new-chat-btn';
      newChatBtn.title = 'Start New Chat';
      newChatBtn.setAttribute('aria-label', 'Start New Chat');
      newChatBtn.addEventListener('click', (e) => {
        e.preventDefault();
        startNewConversation();
      });
      newChatBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startNewConversation();
        }
      });
    }

    // 6. Attach Theme Toggle Buttons
    const lightBtn = allButtons.find(b =>
      b.textContent.includes('Light') ||
      b.querySelector('.material-symbols-outlined')?.textContent.trim() === 'light_mode'
    );
    const darkBtn = allButtons.find(b =>
      b.textContent.includes('Dark') ||
      b.querySelector('.material-symbols-outlined')?.textContent.trim() === 'dark_mode'
    );

    if (lightBtn && darkBtn) {
      lightBtn.id = 'theme-btn-light';
      darkBtn.id = 'theme-btn-dark';
      lightBtn.title = 'Switch to Light Theme';
      darkBtn.title = 'Switch to Dark Theme';

      lightBtn.addEventListener('click', () => applyTheme('light', true));
      darkBtn.addEventListener('click', () => applyTheme('dark', true));

      const themeContainer = lightBtn.closest('.rounded-full');
      if (themeContainer) {
        themeContainer.id = 'sidebar-theme-toggle';
        const bottomRow = themeContainer.closest('.flex.items-center.justify-between');
        if (bottomRow) bottomRow.classList.add('sidebar-bottom-controls');
      }
    }

    // 7. Search Input & Collapsed Search Icon
    const searchInput = mainSidebar.querySelector('input[placeholder*="Search chats"]');
    if (searchInput) {
      searchInput.id = 'sidebar-search-input';
      searchInput.setAttribute('aria-label', 'Search chats');
      const searchBox = searchInput.closest('div.relative');
      if (searchBox) {
        searchBox.id = 'sidebar-search-container';
        
        let collapsedBtn = document.getElementById('sidebar-search-btn-collapsed');
        if (!collapsedBtn) {
          collapsedBtn = document.createElement('button');
          collapsedBtn.id = 'sidebar-search-btn-collapsed';
          collapsedBtn.type = 'button';
          collapsedBtn.title = 'Search chats';
          collapsedBtn.setAttribute('aria-label', 'Search chats');
          collapsedBtn.className = 'w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors mx-auto';
          collapsedBtn.innerHTML = '<span class="material-symbols-outlined text-[20px]">search</span>';
          collapsedBtn.addEventListener('click', () => {
            toggleSidebar(false);
            setTimeout(() => {
              searchInput.focus();
            }, 180);
          });
          searchBox.parentElement.appendChild(collapsedBtn);
        }
      }

      searchInput.addEventListener('input', (e) => {
        renderRecentChats(e.target.value);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = '';
          renderRecentChats('');
        }
      });
    }

    // 8. Navigation Links Tooltips & Brand Text
    mainSidebar.querySelectorAll('nav a').forEach(a => {
      const text = a.querySelector('span:not(.material-symbols-outlined)')?.textContent.trim();
      if (text && !a.title) a.title = text;
    });

    const brandText = mainSidebar.querySelector('.h-16 .font-title-md');
    if (brandText) brandText.classList.add('sidebar-brand-text');

    mainSidebar.querySelectorAll('.uppercase.tracking-wider').forEach(el => {
      const row = el.closest('.px-space-md');
      if (row) row.classList.add('sidebar-section-header');
    });

    // 9. Recent Chats Container ID Setup & Initial Render
    const recentHeader = Array.from(mainSidebar.querySelectorAll('span')).find(s => s.textContent.trim() === 'Recent Chats');
    if (recentHeader) {
      const headerRow = recentHeader.closest('.px-space-md');
      if (headerRow) {
        headerRow.id = 'sidebar-recent-header';
        const countSpan = headerRow.querySelector('.font-code-sm');
        if (countSpan) countSpan.id = 'sidebar-recent-count';
      }
      const listContainer = headerRow ? headerRow.nextElementSibling : null;
      if (listContainer) {
        listContainer.id = 'sidebar-recent-chats-list';
      }
    }

    renderRecentChats();

    // 10. Attach Profile Section
    const profileRow = document.getElementById('sidebar-profile-section') ||
      mainSidebar.querySelector('img[alt="Profile"]')?.closest('.flex.items-center.gap-space-sm') ||
      mainSidebar.querySelector('.flex.items-center.gap-space-sm.pt-space-xs');
    if (profileRow) {
      profileRow.id = 'sidebar-profile-section';
      profileRow.style.cursor = 'pointer';
      profileRow.title = 'Account Options';
      profileRow.setAttribute('role', 'button');
      profileRow.setAttribute('tabindex', '0');

      // Update name/email if stored user exists
      try {
        const stored = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
        if (stored) {
          const u = JSON.parse(stored);
          const nameSpan = profileRow.querySelector('.font-label-md');
          if (nameSpan && u.name) nameSpan.textContent = u.name;
          const emailSpan = profileRow.querySelector('.font-body-sm');
          if (emailSpan && u.email) emailSpan.textContent = u.email;
          const badge = profileRow.querySelector('.bg-tertiary-fixed');
          if (badge) badge.remove();
        }
      } catch (e) {}

      profileRow.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProfilePopover();
      });

        profileRow.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleProfilePopover();
          }
        });
    }

    createProfilePopoverDOM();

    // Close popover on outside click or escape
    document.addEventListener('click', (e) => {
      const popover = document.getElementById('sidebar-profile-popover');
      const profileRow = document.getElementById('sidebar-profile-section');
      if (popover && popover.style.display === 'block') {
        if (!popover.contains(e.target) && !profileRow?.contains(e.target)) {
          hideProfilePopover();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideProfilePopover();
        hideProfileModal();
      }
    });

    // 10. If on Active Chat screen, load the active conversation
    const isChatPage = window.location.pathname.includes('02_active_conversation');
    if (isChatPage) {
      const activeId = getActiveChatId('general_chat');
      loadActiveConversationIntoView(activeId);
    }

    // 11. Synchronize conversations with Supabase if authenticated
    syncAllConversationsFromSupabase();
  });
})();

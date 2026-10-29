/**
 * SmartAssist AI — Study Assistant Engine
 * Handles Target Syllabus parameters, Depth selection, Gemini API execution,
 * Interactive Practice Quizzes, Safe Markdown rendering, and truthful Academic Progress.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Syllabus Knowledge Base (Standard B.Tech CSE Core Curriculum)
  // ---------------------------------------------------------------------------
  const SYLLABUS_DATA = {
    'Operating Systems': [
      'Process Scheduling',
      'Deadlocks & Banker\'s Algorithm',
      'Memory Management & Paging',
      'Virtual Memory & Page Replacement',
      'Semaphores & Inter-Process Communication',
      'File Systems & Disk Scheduling'
    ],
    'Database Management Systems (DBMS)': [
      'Normalization (1NF, 2NF, 3NF, BCNF)',
      'ACID Properties & Transaction States',
      'Concurrency Control & Two-Phase Locking',
      'Indexing & B+ Trees',
      'Relational Algebra & SQL Optimization',
      'ER Modeling & Schema Design'
    ],
    'Computer Networks': [
      'OSI & TCP/IP 5-Layer Model',
      'IPv4 & IPv6 Subnetting & CIDR',
      'Routing Algorithms (Dijkstra, Distance Vector)',
      'TCP Flow & Congestion Control vs UDP',
      'Application Layer (DNS, HTTP/2, TLS 1.3)',
      'Data Link Layer & CSMA/CD'
    ],
    'Design & Analysis of Algorithms': [
      'Asymptotic Notation & Time Complexity',
      'Divide & Conquer (Merge Sort, Binary Search)',
      'Dynamic Programming (0/1 Knapsack, LCS)',
      'Greedy Algorithms (Kruskal, Prim, Dijkstra)',
      'Graph Traversals (BFS, DFS, Topological Sort)',
      'NP-Completeness & Reductions'
    ],
    'Computer Organization & Architecture': [
      'Instruction Set Architecture & Addressing Modes',
      'Pipelining & Pipeline Hazards',
      'Cache Memory Mapping (Direct, Set-Associative)',
      'Virtual Memory & TLB Operation',
      'ALU Design & IEEE 754 Floating Point',
      'I/O Architecture & DMA Controllers'
    ],
    'Engineering Mathematics': [
      'Linear Algebra (Eigenvalues & Eigenvectors)',
      'Probability Distributions & Bayes Theorem',
      'Discrete Mathematics & Graph Theory',
      'Calculus & Multivariable Optimization',
      'Numerical Methods & Interpolation',
      'Recurrence Relations & Generating Functions'
    ]
  };

  // ---------------------------------------------------------------------------
  // 2. Application State
  // ---------------------------------------------------------------------------
  const state = {
    subject: 'Operating Systems',
    topic: 'Process Scheduling',
    depth: 'intermediate',
    mode: 'explain', // 'explain' | 'summarize' | 'mcq'
    notes: '',
    isGenerating: false,
    currentResultMarkdown: '',
    currentQuiz: null,
    quizIndex: 0,
    quizSelectedKey: null,
    quizAnswers: {}, // questionId -> selectedKey
    quizResults: {}, // questionId -> { isCorrect, correctKey, explanation }
    quizScore: 0,
    progress: {
      masteredTopics: [],
      explanationsCount: 0,
      quizzesCount: 0,
      totalScore: 0,
      totalQuestions: 0
    }
  };

  // ---------------------------------------------------------------------------
  // 3. DOM Elements Cache
  // ---------------------------------------------------------------------------
  let el = {};

  function cacheDomElements() {
    el = {
      // Inputs
      subjectInput: document.getElementById('subjectInput'),
      subjectDatalist: document.getElementById('subjectDatalist'),
      subjectClearBtn: document.getElementById('subjectClearBtn'),
      topicInput: document.getElementById('topicInput'),
      topicDatalist: document.getElementById('topicDatalist'),
      topicClearBtn: document.getElementById('topicClearBtn'),
      topicChipsContainer: document.getElementById('topicChipsContainer'),
      depthSelector: document.getElementById('depthSelector'),
      depthLabel: document.getElementById('depthLabel'),
      notesInput: document.getElementById('studyNotesInput'),
      notesClearBtn: document.getElementById('notesClearBtn'),

      // Execution Mode Cards
      modeCardExplain: document.getElementById('modeCardExplain'),
      modeCardSummarize: document.getElementById('modeCardSummarize'),
      modeCardMcq: document.getElementById('modeCardMcq'),
      executeBtn: document.getElementById('executeStudyBtn'),
      executeBtnText: document.getElementById('executeBtnText'),
      executeBtnIcon: document.getElementById('executeBtnIcon'),
      executeBtnSpinner: document.getElementById('executeBtnSpinner'),
      errorBanner: document.getElementById('studyErrorBanner'),
      errorText: document.getElementById('studyErrorText'),
      errorDismiss: document.getElementById('studyErrorDismiss'),

      // Results Panel
      resultHeaderBadge: document.getElementById('resultHeaderBadge'),
      resultTopicTitle: document.getElementById('resultTopicTitle'),
      resultDepthBadge: document.getElementById('resultDepthBadge'),
      resultEmptyState: document.getElementById('resultEmptyState'),
      resultLoadingState: document.getElementById('resultLoadingState'),
      resultLoadingText: document.getElementById('resultLoadingText'),
      resultOutputCard: document.getElementById('resultOutputCard'),
      resultMarkdownContent: document.getElementById('resultMarkdownContent'),
      copyResultBtn: document.getElementById('copyResultBtn'),
      regenerateBtn: document.getElementById('regenerateBtn'),
      markMasteredBtn: document.getElementById('markMasteredBtn'),
      clearResultBtn: document.getElementById('clearResultBtn'),

      // Quiz Panel
      quizEmptyState: document.getElementById('quizEmptyState'),
      quizActiveCard: document.getElementById('quizActiveCard'),
      quizScoreCard: document.getElementById('quizScoreCard'),
      quizQuestionCountBadge: document.getElementById('quizQuestionCountBadge'),
      quizDifficultyBadge: document.getElementById('quizDifficultyBadge'),
      quizQuestionText: document.getElementById('quizQuestionText'),
      quizOptionsContainer: document.getElementById('quizOptionsContainer'),
      quizFeedbackBanner: document.getElementById('quizFeedbackBanner'),
      quizFeedbackTitle: document.getElementById('quizFeedbackTitle'),
      quizFeedbackText: document.getElementById('quizFeedbackText'),
      quizSubmitBtn: document.getElementById('quizSubmitBtn'),
      quizNextBtn: document.getElementById('quizNextBtn'),
      quizScoreNumber: document.getElementById('quizScoreNumber'),
      quizScorePercent: document.getElementById('quizScorePercent'),
      quizScoreMsg: document.getElementById('quizScoreMsg'),
      quizRetryBtn: document.getElementById('quizRetryBtn'),
      generateQuizTriggerBtn: document.getElementById('generateQuizTriggerBtn'),

      // Academic Progress Indicators
      masteredCountText: document.getElementById('masteredCountText'),
      retentionIndexText: document.getElementById('retentionIndexText'),
      retentionSubText: document.getElementById('retentionSubText'),
      viewProgressModalBtn: document.getElementById('viewProgressModalBtn'),

      // Progress Modal
      progressModal: document.getElementById('progressModal'),
      closeProgressModalBtn: document.getElementById('closeProgressModalBtn'),
      modalMasteredList: document.getElementById('modalMasteredList'),
      modalTotalExplanations: document.getElementById('modalTotalExplanations'),
      modalTotalQuizzes: document.getElementById('modalTotalQuizzes'),
      modalAvgScore: document.getElementById('modalAvgScore')
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Safe Markdown Renderer
  // ---------------------------------------------------------------------------
  function renderMarkdownSafe(markdownText) {
    if (!markdownText) return '';

    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        return window.marked.parse(markdownText);
      } catch (e) {
        // Fallback to internal parser
      }
    }

    // High quality internal markdown parser
    let html = markdownText
      // Escape unsafe HTML entities
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Code blocks ```lang\ncode\n```
      .replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="my-3 p-3.5 rounded-xl bg-[#1a1a2c] text-emerald-300 font-code-sm text-code-sm overflow-x-auto shadow-inner"><code class="language-${lang}">${code.trim()}</code></pre>`;
      })
      // Inline code `code`
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-surface-container font-code-sm text-code-sm text-primary">$1</code>')
      // Headings ###
      .replace(/^### (.*$)/gim, '<h3 class="font-title-md text-title-md font-bold text-on-surface mt-4 mb-1.5 flex items-center gap-2"><span class="w-1.5 h-4 rounded-full bg-primary"></span>$1</h3>')
      // Headings ##
      .replace(/^## (.*$)/gim, '<h2 class="font-headline-lg text-headline-lg font-bold text-on-surface mt-5 mb-2">$1</h2>')
      // Bold **text**
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-primary">$1</strong>')
      // Italic *text*
      .replace(/\*([^*]+)\*/g, '<em class="italic text-on-surface-variant">$1</em>')
      // Unordered lists
      .replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ml-4 list-disc text-on-surface py-0.5 leading-relaxed">$1</li>')
      // Numbered lists
      .replace(/^\s*(\d+)\.\s+(.*)$/gim, '<li class="ml-4 list-decimal text-on-surface py-0.5 leading-relaxed">$2</li>')
      // Paragraphs
      .replace(/\n\n+/g, '</p><p class="font-body-md text-body-md text-on-surface leading-relaxed mb-3">');

    return `<p class="font-body-md text-body-md text-on-surface leading-relaxed mb-3">${html}</p>`;
  }

  // ---------------------------------------------------------------------------
  // 5. Academic Progress Tracking & Truthful Persistence
  // ---------------------------------------------------------------------------
  function getStorageKey() {
    let userId = 'local';
    try {
      const stored = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.id) userId = u.id;
      }
    } catch (e) {}
    return `smartassist_study_progress_${userId}`;
  }

  async function loadAcademicProgress() {
    let loaded = null;

    // 1. Try reading from Supabase study_progress table
    try {
      if (window.SmartAssistAuth) {
        const client = await window.SmartAssistAuth.getClient();
        const user = await window.SmartAssistAuth.getUser();
        if (client && user?.id) {
          const { data, error } = await client
            .from('study_progress')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data && !error) {
            loaded = {
              masteredTopics: Array.isArray(data.topics_mastered) ? data.topics_mastered : [],
              explanationsCount: data.explanations_completed || 0,
              quizzesCount: data.quizzes_completed || 0,
              totalScore: data.total_quiz_score || 0,
              totalQuestions: data.total_quiz_questions || 0
            };
          }
        }
      }
    } catch (e) {
      // Table may not exist yet in user's Supabase project
    }

    // 2. Fallback to resilient localStorage
    if (!loaded) {
      try {
        const local = localStorage.getItem(getStorageKey());
        if (local) {
          loaded = JSON.parse(local);
        }
      } catch (e) {}
    }

    if (loaded) {
      state.progress = {
        masteredTopics: Array.isArray(loaded.masteredTopics) ? loaded.masteredTopics : [],
        explanationsCount: Number(loaded.explanationsCount) || 0,
        quizzesCount: Number(loaded.quizzesCount) || 0,
        totalScore: Number(loaded.totalScore) || 0,
        totalQuestions: Number(loaded.totalQuestions) || 0
      };
    }

    renderProgressUI();
  }

  async function saveAcademicProgress() {
    // 1. Save locally
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.progress));
    } catch (e) {}

    // 2. Save to Supabase study_progress if available
    try {
      if (window.SmartAssistAuth) {
        const client = await window.SmartAssistAuth.getClient();
        const user = await window.SmartAssistAuth.getUser();
        if (client && user?.id) {
          const retention = state.progress.totalQuestions > 0
            ? Math.round((state.progress.totalScore / state.progress.totalQuestions) * 100)
            : 85;

          await client.from('study_progress').upsert({
            user_id: user.id,
            topics_mastered: state.progress.masteredTopics,
            explanations_completed: state.progress.explanationsCount,
            quizzes_completed: state.progress.quizzesCount,
            total_quiz_score: state.progress.totalScore,
            total_quiz_questions: state.progress.totalQuestions,
            retention_index: retention,
            updated_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.warn('[StudyAssistant] study_progress sync notice:', e.message);
    }

    renderProgressUI();
  }

  function renderProgressUI() {
    const masteredCount = state.progress.masteredTopics.length;
    if (el.masteredCountText) {
      el.masteredCountText.textContent = masteredCount === 0
        ? '0 Topics Mastered'
        : `${masteredCount} Topic${masteredCount > 1 ? 's' : ''} Mastered`;
    }

    // Retention index calculation
    const retention = state.progress.totalQuestions > 0
      ? Math.round((state.progress.totalScore / state.progress.totalQuestions) * 100)
      : null;

    if (el.retentionIndexText) {
      el.retentionIndexText.textContent = retention !== null
        ? `Retention Index: ${retention}%`
        : 'Retention Index: Ready';
    }
    if (el.retentionSubText) {
      el.retentionSubText.textContent = state.progress.quizzesCount > 0
        ? `Based on ${state.progress.quizzesCount} quiz session${state.progress.quizzesCount > 1 ? 's' : ''} completed`
        : 'Complete your first practice quiz to calculate diagnostic retention';
    }

    // Modal stats
    if (el.modalTotalExplanations) el.modalTotalExplanations.textContent = state.progress.explanationsCount;
    if (el.modalTotalQuizzes) el.modalTotalQuizzes.textContent = state.progress.quizzesCount;
    if (el.modalAvgScore) el.modalAvgScore.textContent = retention !== null ? `${retention}%` : 'N/A';

    if (el.modalMasteredList) {
      if (masteredCount === 0) {
        el.modalMasteredList.innerHTML = `
          <div class="p-4 rounded-xl bg-surface-container-low text-center text-on-surface-variant font-body-sm text-body-sm">
            No topics mastered yet. Complete topic quizzes with 80%+ score or click "Mark Topic Mastered" after completing a study session.
          </div>
        `;
      } else {
        el.modalMasteredList.innerHTML = state.progress.masteredTopics.map(t => `
          <div class="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low">
            <span class="font-body-md text-body-md font-medium text-on-surface truncate">${t}</span>
            <span class="inline-flex items-center gap-1 text-primary font-code-sm text-code-sm font-semibold shrink-0">
              <span class="material-symbols-outlined text-[16px]">verified</span> Mastered
            </span>
          </div>
        `).join('');
      }
    }
  }

  // Record an explanation session
  function recordExplanationActivity(topic) {
    state.progress.explanationsCount += 1;
    saveAcademicProgress();
  }

  // Record quiz completion and auto-master topic if score >= 80%
  function recordQuizActivity(topic, score, totalQuestions) {
    state.progress.quizzesCount += 1;
    state.progress.totalScore += score;
    state.progress.totalQuestions += totalQuestions;

    const ratio = score / totalQuestions;
    if (ratio >= 0.8 && topic && !state.progress.masteredTopics.includes(topic)) {
      state.progress.masteredTopics.push(topic);
    }
    saveAcademicProgress();
  }

  // ---------------------------------------------------------------------------
  // 6. Syllabus Autocomplete & Topic Suggestion Chips
  // ---------------------------------------------------------------------------
  function populateSubjectDatalist() {
    if (!el.subjectDatalist) return;
    el.subjectDatalist.innerHTML = Object.keys(SYLLABUS_DATA)
      .map(s => `<option value="${s}"></option>`)
      .join('');
  }

  function updateTopicSuggestions(subjectName) {
    const topics = SYLLABUS_DATA[subjectName] || [];

    // 1. Update Datalist
    if (el.topicDatalist) {
      el.topicDatalist.innerHTML = topics
        .map(t => `<option value="${t}"></option>`)
        .join('');
    }

    // 2. Render Suggestion Chips
    if (el.topicChipsContainer) {
      if (topics.length === 0) {
        el.topicChipsContainer.innerHTML = '';
        return;
      }
      el.topicChipsContainer.innerHTML = topics.slice(0, 4).map(t => `
        <button type="button" class="topic-chip px-2.5 py-1 rounded-full bg-surface-container hover:bg-surface-container-high text-on-surface font-code-sm text-[11px] transition-colors truncate max-w-[200px]" title="Quick select ${t}">
          ${t}
        </button>
      `).join('');

      el.topicChipsContainer.querySelectorAll('.topic-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.textContent.trim();
          if (el.topicInput) {
            el.topicInput.value = val;
            state.topic = val;
            saveSessionParams();
          }
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Comprehension Depth Controller
  // ---------------------------------------------------------------------------
  const DEPTH_LABELS = {
    beginner: 'Foundational Conceptual & Intuitive Analogies',
    intermediate: 'Technical & Algorithmic Step-by-Step Reasoning',
    advanced: 'In-Depth Systems Mechanics & Rigorous Trade-offs'
  };

  function setComprehensionDepth(newDepth) {
    if (!['beginner', 'intermediate', 'advanced'].includes(newDepth)) return;
    state.depth = newDepth;

    if (el.depthSelector) {
      el.depthSelector.querySelectorAll('.depth-btn').forEach(btn => {
        const btnDepth = btn.getAttribute('data-depth');
        if (btnDepth === newDepth) {
          btn.className = 'depth-btn flex items-center justify-center py-2 px-3 rounded-lg bg-surface-container-lowest text-primary font-label-md text-label-md shadow-sm transition-all font-semibold';
        } else {
          btn.className = 'depth-btn flex items-center justify-center py-2 px-3 rounded-lg text-secondary hover:text-on-surface font-label-md text-label-md transition-all';
        }
      });
    }

    if (el.depthLabel) {
      el.depthLabel.textContent = DEPTH_LABELS[newDepth] || 'Technical & Algorithmic';
    }

    saveSessionParams();
  }

  // ---------------------------------------------------------------------------
  // 8. Execution Mode Cards Controller
  // ---------------------------------------------------------------------------
  const MODE_METADATA = {
    explain: {
      btnText: 'Explain Topic',
      btnIcon: 'psychology'
    },
    summarize: {
      btnText: 'Summarize Notes',
      btnIcon: 'receipt_long'
    },
    mcq: {
      btnText: 'Generate 5 Practice MCQs',
      btnIcon: 'quiz'
    }
  };

  function setExecutionMode(newMode) {
    if (!['explain', 'summarize', 'mcq'].includes(newMode)) return;
    state.mode = newMode;

    const cards = [
      { id: 'explain', el: el.modeCardExplain },
      { id: 'summarize', el: el.modeCardSummarize },
      { id: 'mcq', el: el.modeCardMcq }
    ];

    cards.forEach(c => {
      if (!c.el) return;
      const isSelected = c.id === newMode;
      const badge = c.el.querySelector('.mode-active-badge');
      const arrow = c.el.querySelector('.mode-arrow');

      if (isSelected) {
        c.el.className = 'group relative flex items-start gap-space-md p-space-md rounded-xl bg-primary-container text-on-primary-container shadow-md cursor-pointer transition-all duration-200';
        if (badge) badge.classList.remove('hidden');
        if (arrow) arrow.className = 'material-symbols-outlined absolute right-4 top-4 text-[20px] text-on-primary-container mode-arrow';
      } else {
        c.el.className = 'group relative flex items-start gap-space-md p-space-md rounded-xl bg-surface-container-lowest hover:bg-surface-container transition-all cursor-pointer shadow-sm text-on-surface';
        if (badge) badge.classList.add('hidden');
        if (arrow) arrow.className = 'material-symbols-outlined absolute right-4 top-4 text-[20px] text-secondary group-hover:text-primary transition-colors mode-arrow';
      }
    });

    const meta = MODE_METADATA[newMode];
    if (meta && el.executeBtnText && el.executeBtnIcon) {
      el.executeBtnText.textContent = meta.btnText;
      el.executeBtnIcon.textContent = meta.btnIcon;
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Session Parameters Persistence (Temporary Session State)
  // ---------------------------------------------------------------------------
  function saveSessionParams() {
    try {
      const data = {
        subject: state.subject,
        topic: state.topic,
        depth: state.depth,
        mode: state.mode
      };
      sessionStorage.setItem('smartassist_study_current_session', JSON.stringify(data));
    } catch (e) {}
  }

  function restoreSessionParams() {
    try {
      const raw = sessionStorage.getItem('smartassist_study_current_session');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.subject) {
          state.subject = data.subject;
          if (el.subjectInput) el.subjectInput.value = data.subject;
          updateTopicSuggestions(data.subject);
        }
        if (data.topic) {
          state.topic = data.topic;
          if (el.topicInput) el.topicInput.value = data.topic;
        }
        if (data.depth) setComprehensionDepth(data.depth);
        if (data.mode) setExecutionMode(data.mode);
      }
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // 10. AI Execution Engine (Calls POST /api/study/assist)
  // ---------------------------------------------------------------------------
  function showError(msg) {
    if (!el.errorBanner) return;
    if (el.errorText) el.errorText.textContent = msg;
    el.errorBanner.classList.remove('hidden');
    el.errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    if (el.errorBanner) el.errorBanner.classList.add('hidden');
  }

  async function executeStudyOperation() {
    if (state.isGenerating) return;
    hideError();

    // 1. Validate inputs
    const subjectVal = (el.subjectInput?.value || '').trim();
    const topicVal = (el.topicInput?.value || '').trim();
    const notesVal = (el.notesInput?.value || '').trim();

    state.subject = subjectVal;
    state.topic = topicVal;
    state.notes = notesVal;

    if (state.mode === 'explain' || state.mode === 'mcq') {
      if (!subjectVal) {
        showError('Please specify or select an academic Subject.');
        el.subjectInput?.focus();
        return;
      }
      if (!topicVal) {
        showError('Please enter or select a Topic to study.');
        el.topicInput?.focus();
        return;
      }
    } else if (state.mode === 'summarize') {
      if (!notesVal && !topicVal) {
        showError('Please paste Supplementary Notes or provide a Topic to summarize.');
        el.notesInput?.focus();
        return;
      }
    }

    // 2. Set Loading UI State
    state.isGenerating = true;
    if (el.executeBtn) el.executeBtn.setAttribute('disabled', 'true');
    if (el.executeBtnSpinner) el.executeBtnSpinner.classList.remove('hidden');
    if (el.executeBtnIcon) el.executeBtnIcon.classList.add('hidden');

    // Show result loading skeleton
    if (el.resultEmptyState) el.resultEmptyState.classList.add('hidden');
    if (el.resultMarkdownContent) el.resultMarkdownContent.classList.add('hidden');
    if (el.resultLoadingState) {
      el.resultLoadingState.classList.remove('hidden');
      if (el.resultLoadingText) {
        el.resultLoadingText.textContent = state.mode === 'mcq'
          ? `Generating 5 diagnostic MCQs for ${topicVal || subjectVal}...`
          : `Synthesizing ${state.mode === 'explain' ? 'topic breakdown' : 'structured summary'} for ${topicVal || subjectVal}...`;
      }
    }

    // Scroll to results on mobile
    if (window.innerWidth < 1024 && el.resultOutputCard) {
      el.resultOutputCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    try {
      const response = await fetch('/api/study/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: state.mode,
          subject: subjectVal || 'Computer Science',
          topic: topicVal || 'Lecture Notes',
          depth: state.depth,
          notes: notesVal
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate study materials.');
      }

      // Handle Success
      if (state.mode === 'mcq') {
        handleMcqSuccess(data.data);
      } else {
        handleTextSuccess(data);
      }

      saveSessionParams();

    } catch (err) {
      console.error('[StudyAssistant Execution Error]:', err);
      showError(err.message || 'Unable to connect to the AI engine. Please ensure server is running.');
      // Restore empty state if no prior result
      if (!state.currentResultMarkdown && el.resultEmptyState) {
        el.resultEmptyState.classList.remove('hidden');
      }
      if (el.resultMarkdownContent && state.currentResultMarkdown) {
        el.resultMarkdownContent.classList.remove('hidden');
      }
    } finally {
      state.isGenerating = false;
      if (el.executeBtn) el.executeBtn.removeAttribute('disabled');
      if (el.executeBtnSpinner) el.executeBtnSpinner.classList.add('hidden');
      if (el.executeBtnIcon) el.executeBtnIcon.classList.remove('hidden');
      if (el.resultLoadingState) el.resultLoadingState.classList.add('hidden');
    }
  }

  // ---------------------------------------------------------------------------
  // 11. Study Conversation Persistence (Multi-Section Separation)
  // ---------------------------------------------------------------------------
  function saveStudyConversation(resultData, isNewExecution = true) {
    if (!isNewExecution) return;

    const isMcq = state.mode === 'mcq';
    const modeLabel = state.mode === 'explain' ? 'Topic' : state.mode === 'summarize' ? 'Summary' : 'MCQs';
    const topicTitle = state.topic || state.subject || 'Study Session';
    const title = `${modeLabel}: ${topicTitle}`;

    const userQuery = state.mode === 'explain'
      ? `Explain ${state.topic} in ${state.subject} (${state.depth} depth)`
      : state.mode === 'summarize'
      ? `Summarize notes on ${state.topic || state.subject}`
      : `Generate 5 practice MCQs on ${state.topic} in ${state.subject}`;

    const modelReply = isMcq
      ? `Generated 5 practice MCQs on ${state.topic} (${(state.depth || 'intermediate').toUpperCase()})`
      : (resultData?.markdown || state.currentResultMarkdown || '');

    const messages = [
      {
        role: 'user',
        text: userQuery,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      {
        role: 'model',
        text: modelReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];

    const studyParams = {
      subject: state.subject,
      topic: state.topic,
      depth: state.depth,
      mode: state.mode,
      notes: state.notes || '',
      markdown: isMcq ? '' : (resultData?.markdown || state.currentResultMarkdown),
      quizData: isMcq ? (resultData?.data || state.currentQuiz) : null
    };

    const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
    const activeId = window.getActiveChatId ? window.getActiveChatId('study_assistant') : null;
    let sessionChat = activeId ? allConvs.find(c => c.id === activeId && c.section === 'study_assistant') : null;

    if (!sessionChat) {
      const newId = `study_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      sessionChat = {
        id: newId,
        section: 'study_assistant',
        title: title,
        timestamp: Date.now(),
        messages: messages,
        studyParams: studyParams
      };
      allConvs.unshift(sessionChat);
      if (window.setActiveChatId) {
        window.setActiveChatId(newId, 'study_assistant');
      }
    } else {
      sessionChat.title = title;
      sessionChat.timestamp = Date.now();
      sessionChat.messages = messages;
      sessionChat.studyParams = studyParams;
      const idx = allConvs.indexOf(sessionChat);
      if (idx > -1) {
        allConvs.splice(idx, 1);
        allConvs.unshift(sessionChat);
      }
    }

    if (window.saveStoredConversations) {
      window.saveStoredConversations(allConvs);
    }
    if (window.renderRecentChats) {
      window.renderRecentChats();
    }
  }

  // ---------------------------------------------------------------------------
  // 12. Handle Explain / Summarize Result Display
  // ---------------------------------------------------------------------------
  function handleTextSuccess(data, persist = true) {
    state.currentResultMarkdown = data.markdown || '';

    // Update Header
    if (el.resultTopicTitle) {
      el.resultTopicTitle.textContent = `${data.mode === 'explain' ? 'Topic' : 'Summary'}: ${data.topic || data.subject}`;
    }
    if (el.resultHeaderBadge) {
      el.resultHeaderBadge.textContent = `${(data.subject || 'CS').slice(0, 8).toUpperCase()} • ${(data.depth || 'intermediate').toUpperCase()}`;
    }
    if (el.resultDepthBadge) {
      el.resultDepthBadge.textContent = `Verified • ${data.depth || 'intermediate'}`;
    }

    // Render formatted markdown
    if (el.resultMarkdownContent) {
      el.resultMarkdownContent.innerHTML = renderMarkdownSafe(state.currentResultMarkdown);
      el.resultMarkdownContent.classList.remove('hidden');
    }
    if (el.resultEmptyState) el.resultEmptyState.classList.add('hidden');
    if (el.resultLoadingState) el.resultLoadingState.classList.add('hidden');

    // Save study session to recent chats
    if (persist) {
      saveStudyConversation(data, true);
    }

    // Update academic progress
    recordExplanationActivity(data.topic);
  }

  // ---------------------------------------------------------------------------
  // 13. Interactive MCQ Practice Quiz Engine
  // ---------------------------------------------------------------------------
  function handleMcqSuccess(quizData, persist = true) {
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      showError('Received malformed questions data from AI.');
      return;
    }

    state.currentQuiz = quizData;
    state.quizIndex = 0;
    state.quizSelectedKey = null;
    state.quizAnswers = {};
    state.quizResults = {};
    state.quizScore = 0;

    // Show active quiz card, hide empty and score cards
    if (el.quizEmptyState) el.quizEmptyState.classList.add('hidden');
    if (el.quizScoreCard) el.quizScoreCard.classList.add('hidden');
    if (el.quizActiveCard) el.quizActiveCard.classList.remove('hidden');

    renderCurrentQuestion();

    // Save study session to recent chats
    if (persist) {
      saveStudyConversation({ mode: 'mcq', data: quizData }, true);
    }
  }

  function renderCurrentQuestion() {
    if (!state.currentQuiz) return;
    const qList = state.currentQuiz.questions;
    const q = qList[state.quizIndex];
    if (!q) return;

    // 1. Header & Counter
    if (el.quizQuestionCountBadge) {
      el.quizQuestionCountBadge.textContent = `Question ${state.quizIndex + 1} of ${qList.length}`;
    }
    if (el.quizDifficultyBadge) {
      el.quizDifficultyBadge.textContent = (state.currentQuiz.difficulty || state.depth).toUpperCase();
    }
    if (el.quizQuestionText) {
      el.quizQuestionText.textContent = q.question;
    }

    // 2. Hide feedback banner for new question
    if (el.quizFeedbackBanner) el.quizFeedbackBanner.classList.add('hidden');

    // 3. Render 4 Options
    const currentAnswer = state.quizAnswers[q.id];
    const isSubmitted = Boolean(state.quizResults[q.id]);

    state.quizSelectedKey = currentAnswer || null;

    if (el.quizOptionsContainer) {
      el.quizOptionsContainer.innerHTML = (q.options || []).map(opt => {
        const isSelected = opt.key === state.quizSelectedKey;
        let cardClasses = 'quiz-option flex items-center justify-between p-space-md rounded-xl cursor-pointer transition-all border';

        if (isSubmitted) {
          if (opt.key === q.correctKey) {
            cardClasses += ' bg-emerald-100 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-200';
          } else if (isSelected && opt.key !== q.correctKey) {
            cardClasses += ' bg-red-100 dark:bg-red-950/60 border-error text-error';
          } else {
            cardClasses += ' bg-surface-container-low border-transparent text-on-surface opacity-70';
          }
        } else if (isSelected) {
          cardClasses += ' bg-secondary-container/80 border-primary text-primary shadow-sm font-semibold';
        } else {
          cardClasses += ' bg-surface-container-low border-transparent hover:bg-surface-container text-on-surface';
        }

        return `
          <div data-opt-key="${opt.key}" class="${cardClasses}">
            <div class="flex items-center gap-3">
              <span class="w-7 h-7 rounded-lg ${isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-secondary'} flex items-center justify-center font-code-sm text-code-sm font-semibold transition-colors">
                ${opt.key}
              </span>
              <span class="font-body-md text-body-md leading-snug">${opt.text}</span>
            </div>
            <div class="w-5 h-5 rounded-full flex items-center justify-center ${isSelected ? (isSubmitted && opt.key === q.correctKey ? 'bg-emerald-600 text-white' : 'bg-primary text-on-primary') : 'bg-surface-container-highest'}">
              ${isSelected ? '<span class="material-symbols-outlined text-[14px]">check</span>' : ''}
            </div>
          </div>
        `;
      }).join('');

      // Wire option clicks
      if (!isSubmitted) {
        el.quizOptionsContainer.querySelectorAll('.quiz-option').forEach(item => {
          item.addEventListener('click', () => {
            const optKey = item.getAttribute('data-opt-key');
            state.quizSelectedKey = optKey;
            state.quizAnswers[q.id] = optKey;
            renderCurrentQuestion();
          });
        });
      }
    }

    // 4. Update Buttons State
    if (el.quizSubmitBtn) {
      if (isSubmitted) {
        el.quizSubmitBtn.classList.add('hidden');
      } else {
        el.quizSubmitBtn.classList.remove('hidden');
        if (state.quizSelectedKey) {
          el.quizSubmitBtn.removeAttribute('disabled');
        } else {
          el.quizSubmitBtn.setAttribute('disabled', 'true');
        }
      }
    }

    if (el.quizNextBtn) {
      if (isSubmitted) {
        el.quizNextBtn.classList.remove('hidden');
        const isLast = state.quizIndex === qList.length - 1;
        el.quizNextBtn.innerHTML = isLast
          ? '<span>Complete Quiz</span><span class="material-symbols-outlined text-[18px]">done_all</span>'
          : '<span>Next Question</span><span class="material-symbols-outlined text-[18px]">arrow_forward</span>';
      } else {
        el.quizNextBtn.classList.add('hidden');
      }
    }

    // If already submitted, show feedback banner
    if (isSubmitted && el.quizFeedbackBanner) {
      const res = state.quizResults[q.id];
      el.quizFeedbackBanner.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-900', 'bg-red-100', 'text-red-900');
      if (res.isCorrect) {
        el.quizFeedbackBanner.classList.add('bg-emerald-100', 'text-emerald-900');
        if (el.quizFeedbackTitle) el.quizFeedbackTitle.textContent = 'Correct Answer!';
      } else {
        el.quizFeedbackBanner.classList.add('bg-red-100', 'text-red-900');
        if (el.quizFeedbackTitle) el.quizFeedbackTitle.textContent = `Incorrect — Option ${q.correctKey} was correct`;
      }
      if (el.quizFeedbackText) el.quizFeedbackText.textContent = q.explanation || 'No additional explanation provided.';
    }
  }

  function handleQuizSubmitAnswer() {
    if (!state.currentQuiz) return;
    const qList = state.currentQuiz.questions;
    const q = qList[state.quizIndex];
    if (!q || !state.quizSelectedKey) return;

    const isCorrect = state.quizSelectedKey.toUpperCase() === q.correctKey.toUpperCase();
    if (isCorrect) state.quizScore += 1;

    state.quizResults[q.id] = {
      isCorrect,
      selectedKey: state.quizSelectedKey,
      correctKey: q.correctKey,
      explanation: q.explanation
    };

    renderCurrentQuestion();
  }

  function handleQuizNext() {
    if (!state.currentQuiz) return;
    const qList = state.currentQuiz.questions;

    if (state.quizIndex < qList.length - 1) {
      state.quizIndex += 1;
      renderCurrentQuestion();
    } else {
      // Completed quiz!
      finishQuiz();
    }
  }

  function finishQuiz() {
    const qList = state.currentQuiz.questions;
    const score = state.quizScore;
    const total = qList.length;
    const pct = Math.round((score / total) * 100);

    // Hide active question, show score card
    if (el.quizActiveCard) el.quizActiveCard.classList.add('hidden');
    if (el.quizScoreCard) el.quizScoreCard.classList.remove('hidden');

    if (el.quizScoreNumber) el.quizScoreNumber.textContent = `${score} / ${total}`;
    if (el.quizScorePercent) el.quizScorePercent.textContent = `${pct}% Correct`;

    let msg = 'Good start! Review the concepts and try again.';
    if (pct >= 80) msg = 'Outstanding performance! Topic has been recorded as Mastered ✓';
    else if (pct >= 60) msg = 'Solid effort! Re-read the step-by-step breakdown to solidify edge cases.';
    if (el.quizScoreMsg) el.quizScoreMsg.textContent = msg;

    // Record academic progress truthfully
    recordQuizActivity(state.currentQuiz.topic || state.topic, score, total);
  }

  // ---------------------------------------------------------------------------
  // 13. Copy, Regenerate, Clear Actions
  // ---------------------------------------------------------------------------
  function copyResultToClipboard() {
    if (!state.currentResultMarkdown) return;
    navigator.clipboard.writeText(state.currentResultMarkdown).then(() => {
      if (el.copyResultBtn) {
        const orig = el.copyResultBtn.innerHTML;
        el.copyResultBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] text-emerald-600">done</span><span>Copied!</span>';
        setTimeout(() => {
          el.copyResultBtn.innerHTML = orig;
        }, 1500);
      }
    }).catch(() => {
      showError('Could not copy to clipboard.');
    });
  }

  function resetStudyWorkspace() {
    state.currentResultMarkdown = '';
    state.currentQuiz = null;
    state.notes = '';
    if (el.notesInput) el.notesInput.value = '';

    if (el.resultEmptyState) el.resultEmptyState.classList.remove('hidden');
    if (el.resultMarkdownContent) {
      el.resultMarkdownContent.classList.add('hidden');
      el.resultMarkdownContent.innerHTML = '';
    }
    if (el.resultTopicTitle) el.resultTopicTitle.textContent = 'Ready to Study';

    if (el.quizEmptyState) el.quizEmptyState.classList.remove('hidden');
    if (el.quizActiveCard) el.quizActiveCard.classList.add('hidden');
    if (el.quizScoreCard) el.quizScoreCard.classList.add('hidden');

    sessionStorage.removeItem('smartassist_study_current_session');
    if (window.setActiveChatId) {
      window.setActiveChatId(null, 'study_assistant');
    }
    if (window.renderRecentChats) {
      window.renderRecentChats();
    }
    hideError();
  }

  function loadStudySessionIntoView(sessionOrId) {
    let session = sessionOrId;
    if (typeof sessionOrId === 'string') {
      const allConvs = window.getStoredConversations ? window.getStoredConversations() : [];
      session = allConvs.find(c => c.id === sessionOrId);
    }
    if (!session || !session.studyParams) return;

    if (window.setActiveChatId) {
      window.setActiveChatId(session.id, 'study_assistant');
    }

    const p = session.studyParams;
    state.subject = p.subject || 'Operating Systems';
    state.topic = p.topic || '';
    state.notes = p.notes || '';
    state.depth = p.depth || 'intermediate';
    state.mode = p.mode || 'explain';

    if (el.subjectInput) el.subjectInput.value = state.subject;
    if (el.topicInput) el.topicInput.value = state.topic;
    if (el.notesInput) el.notesInput.value = state.notes;

    updateTopicSuggestions(state.subject);
    setComprehensionDepth(state.depth);
    setExecutionMode(state.mode);

    if (state.mode === 'mcq' && p.quizData) {
      handleMcqSuccess(p.quizData, false);
    } else if (p.markdown) {
      state.currentResultMarkdown = p.markdown;
      if (el.resultTopicTitle) {
        el.resultTopicTitle.textContent = `${state.mode === 'explain' ? 'Topic' : 'Summary'}: ${state.topic || state.subject}`;
      }
      if (el.resultHeaderBadge) {
        el.resultHeaderBadge.textContent = `${(state.subject || 'CS').slice(0, 8).toUpperCase()} • ${(state.depth || 'intermediate').toUpperCase()}`;
      }
      if (el.resultDepthBadge) {
        el.resultDepthBadge.textContent = `Verified • ${state.depth || 'intermediate'}`;
      }
      if (el.resultMarkdownContent) {
        el.resultMarkdownContent.innerHTML = renderMarkdownSafe(state.currentResultMarkdown);
        el.resultMarkdownContent.classList.remove('hidden');
      }
      if (el.resultEmptyState) el.resultEmptyState.classList.add('hidden');
      if (el.resultLoadingState) el.resultLoadingState.classList.add('hidden');
      if (el.quizEmptyState) el.quizEmptyState.classList.remove('hidden');
      if (el.quizActiveCard) el.quizActiveCard.classList.add('hidden');
      if (el.quizScoreCard) el.quizScoreCard.classList.add('hidden');
    }

    if (window.renderRecentChats) {
      window.renderRecentChats();
    }
  }

  window.resetStudyWorkspace = resetStudyWorkspace;
  window.loadStudySessionIntoView = loadStudySessionIntoView;

  function markTopicMasteredManual() {
    const topic = state.topic || (el.topicInput?.value || '').trim();
    if (!topic) return;

    if (!state.progress.masteredTopics.includes(topic)) {
      state.progress.masteredTopics.push(topic);
      saveAcademicProgress();
    }

    if (el.markMasteredBtn) {
      const orig = el.markMasteredBtn.innerHTML;
      el.markMasteredBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] text-emerald-600">verified</span><span>Mastered ✓</span>';
      setTimeout(() => {
        el.markMasteredBtn.innerHTML = orig;
      }, 1500);
    }
  }

  // ---------------------------------------------------------------------------
  // 14. Event Binding & Initialization
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDomElements();
    populateSubjectDatalist();

    // 1. Restore previous session params or set initial topic chips
    restoreSessionParams();
    updateTopicSuggestions(el.subjectInput?.value || 'Operating Systems');

    // 2. Input change listeners
    el.subjectInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      state.subject = val;
      updateTopicSuggestions(val);
      saveSessionParams();
    });

    el.subjectClearBtn?.addEventListener('click', () => {
      if (el.subjectInput) el.subjectInput.value = '';
      state.subject = '';
      updateTopicSuggestions('');
      el.subjectInput?.focus();
    });

    el.topicInput?.addEventListener('input', (e) => {
      state.topic = e.target.value.trim();
      saveSessionParams();
    });

    el.topicClearBtn?.addEventListener('click', () => {
      if (el.topicInput) el.topicInput.value = '';
      state.topic = '';
      el.topicInput?.focus();
    });

    el.notesClearBtn?.addEventListener('click', () => {
      if (el.notesInput) el.notesInput.value = '';
      state.notes = '';
      el.notesInput?.focus();
    });

    // 3. Depth Selection Buttons
    if (el.depthSelector) {
      el.depthSelector.querySelectorAll('.depth-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const d = btn.getAttribute('data-depth');
          setComprehensionDepth(d);
        });
      });
    }

    // 4. Mode Cards Clicks
    el.modeCardExplain?.addEventListener('click', () => setExecutionMode('explain'));
    el.modeCardSummarize?.addEventListener('click', () => setExecutionMode('summarize'));
    el.modeCardMcq?.addEventListener('click', () => setExecutionMode('mcq'));

    // 5. Execution Button
    el.executeBtn?.addEventListener('click', executeStudyOperation);
    el.errorDismiss?.addEventListener('click', hideError);

    // 6. Result Toolbar Buttons
    el.copyResultBtn?.addEventListener('click', copyResultToClipboard);
    el.regenerateBtn?.addEventListener('click', executeStudyOperation);
    el.clearResultBtn?.addEventListener('click', resetStudyWorkspace);
    el.markMasteredBtn?.addEventListener('click', markTopicMasteredManual);

    // 7. Practice Quiz Buttons
    el.quizSubmitBtn?.addEventListener('click', handleQuizSubmitAnswer);
    el.quizNextBtn?.addEventListener('click', handleQuizNext);
    el.quizRetryBtn?.addEventListener('click', () => {
      if (state.currentQuiz) handleMcqSuccess(state.currentQuiz);
    });
    el.generateQuizTriggerBtn?.addEventListener('click', () => {
      setExecutionMode('mcq');
      executeStudyOperation();
    });

    // 8. Progress Modal
    el.viewProgressModalBtn?.addEventListener('click', () => {
      if (el.progressModal) el.progressModal.classList.remove('hidden');
    });
    el.closeProgressModalBtn?.addEventListener('click', () => {
      if (el.progressModal) el.progressModal.classList.add('hidden');
    });
    el.progressModal?.addEventListener('click', (e) => {
      if (e.target === el.progressModal) el.progressModal.classList.add('hidden');
    });

    // 9. Load Academic Progress
    await loadAcademicProgress();

    // 10. Synchronize real user profile with sidebar and header
    if (window.SmartAssistAuth) {
      try {
        const profile = await window.SmartAssistAuth.getProfile();
        if (profile) {
          window.SmartAssistAuth.syncAllAvatarsAndNames(profile);
        }
      } catch (e) {}
    }

    // 11. Restore study session from URL parameter or active chat ID
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    const activeStudyId = sessionParam || (window.getActiveChatId ? window.getActiveChatId('study_assistant') : null);
    if (activeStudyId && typeof window.loadStudySessionIntoView === 'function') {
      window.loadStudySessionIntoView(activeStudyId);
    }
  });

})();

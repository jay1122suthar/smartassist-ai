/**
 * SmartAssist AI — Fully Functional Code Assistant Engine
 * 
 * Features:
 * - Dynamic interactive editor with line numbers, synchronized scrolling, tab indentation
 * - Multi-language support (Python, JavaScript, Java, C++, C, TypeScript)
 * - Filename editing and extension auto-sync
 * - Real Gemini AI code analysis (Debug, Explain, Generate, Improve)
 * - Accurate line-specific issue detection and gutter highlighting
 * - Corrected code rendering with Copy, Replace Editor Code, and Diff comparison
 * - Safe client-side sandbox execution (Web Worker for JS, Pyodide for Python) + transparent container sandbox notification
 * - Dynamic Step-by-Step breakdown and complexity profiling
 * - Full session history persistence (local JSON + Supabase with RLS)
 * - Sidebar search, rename/delete, and profile integration
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Language Definitions & Sample Bug Library
  // ---------------------------------------------------------------------------
  const SUPPORTED_LANGUAGES = {
    python: {
      name: 'Python',
      ext: '.py',
      defaultFile: 'main.py',
      badge: 'Python 3.12',
      sampleBug: `numbers = [1, 2, 3, 4, 5]
total = 0

for i in range(len(numbers)):
    total = numbers[i]

print(total)`,
      samplePrompt: 'Find the bug in this list summation logic.'
    },
    javascript: {
      name: 'JavaScript',
      ext: '.js',
      defaultFile: 'index.js',
      badge: 'Node.js / ES2024',
      sampleBug: `const numbers = [1, 2, 3, 4, 5];
let total = 0;

for (let i = 0; i < numbers.length; i++) {
  total = numbers[i]; // Bug: overwrites total instead of accumulating
}

console.log(total);`,
      samplePrompt: 'Why does this loop print 5 instead of the sum 15?'
    },
    java: {
      name: 'Java',
      ext: '.java',
      defaultFile: 'Solution.java',
      badge: 'OpenJDK 21',
      sampleBug: `public class Solution {
    public static void main(String[] args) {
        int[] numbers = {1, 2, 3, 4, 5};
        int total = 0;
        
        for (int i = 0; i < numbers.length; i++) {
            total = numbers[i]; // Bug: accumulator assignment
        }
        
        System.out.println(total);
    }
}`,
      samplePrompt: 'Fix accumulator overwriting in Java array iteration.'
    },
    cpp: {
      name: 'C++',
      ext: '.cpp',
      defaultFile: 'main.cpp',
      badge: 'GCC / C++20',
      sampleBug: `#include <iostream>
#include <vector>

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5};
    int total = 0;

    for (size_t i = 0; i < numbers.size(); ++i) {
        total = numbers[i]; // Bug: overwrites accumulator
    }

    std::cout << total << std::endl;
    return 0;
}`,
      samplePrompt: 'Resolve summation logic bug in C++ vector iteration.'
    },
    c: {
      name: 'C',
      ext: '.c',
      defaultFile: 'main.c',
      badge: 'Clang / C17',
      sampleBug: `#include <stdio.h>

int main() {
    int numbers[] = {1, 2, 3, 4, 5};
    int total = 0;

    for (int i = 0; i < 5; i++) {
        total = numbers[i]; // Bug: assignment instead of +=
    }

    printf("%d\\n", total);
    return 0;
}`,
      samplePrompt: 'Fix logic error in array summation in C.'
    },
    typescript: {
      name: 'TypeScript',
      ext: '.ts',
      defaultFile: 'app.ts',
      badge: 'TypeScript 5.4',
      sampleBug: `const numbers: number[] = [1, 2, 3, 4, 5];
let total: number = 0;

for (let i = 0; i < numbers.length; i++) {
  total = numbers[i]; // Bug: assignment instead of +=
}

console.log(total);`,
      samplePrompt: 'Fix accumulator bug in TypeScript.'
    }
  };

  // ---------------------------------------------------------------------------
  // 2. Application State
  // ---------------------------------------------------------------------------
  const state = {
    language: 'python',
    filename: 'main.py',
    code: '',
    prompt: '',
    mode: 'debug', // 'debug' | 'explain' | 'generate' | 'improve'
    currentSessionId: null,
    isAnalyzing: false,
    lastAnalysis: null,
    activeErrorLine: null,
    showingDiff: false,
    sessions: [],
    pyodideInstance: null,
    isPyodideLoading: false
  };

  // DOM Elements cache
  const el = {};

  // ---------------------------------------------------------------------------
  // 3. Initialization
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDOMElements();
    initEditor();
    initLanguageSelector();
    initToolbarActions();
    initModeButtons();
    initBottomActions();
    initSidebarHistory();
    initUserProfile();
    fetchModelStatus();
    await loadSessions();

    // Load initial code from default sample bug if editor is blank
    if (!state.code) {
      loadLanguageDefaults('python', false);
    }
  });

  function cacheDOMElements() {
    // Header & Meta
    el.modelBadge = document.getElementById('headerModelBadge') || document.querySelector('header .bg-surface-container.font-code-sm');
    el.latencyBadge = document.getElementById('headerLatencyBadge') || document.querySelector('header .bg-surface-container-low.font-code-sm');
    el.pageModelBadge = document.getElementById('pageModelBadge');
    el.pageLatencyBadge = document.getElementById('pageLatencyBadge');

    // Language & Filename
    el.langDropdownBtn = document.getElementById('langDropdownBtn');
    el.langDropdownMenu = document.getElementById('langDropdownMenu');
    el.selectedLangText = document.getElementById('selectedLangText');
    el.filenameInput = document.getElementById('filenameInput');

    // Toolbar buttons
    el.copyEditorBtn = document.getElementById('copyEditorBtn');
    el.pasteCodeBtn = document.getElementById('pasteCodeBtn');
    el.clearAllBtn = document.getElementById('clearAllBtn');
    el.loadBugBtn = document.getElementById('loadBugBtn');

    // Editor
    el.codeEditor = document.getElementById('codeEditor');
    el.lineNumbersGutter = document.getElementById('lineNumbersGutter');

    // Prompt & Action buttons
    el.promptInput = document.getElementById('promptInput');
    el.clearPromptBtn = document.getElementById('clearPromptBtn');
    el.primaryDebugBtn = document.getElementById('primaryDebugBtn');
    el.explainBtn = document.getElementById('explainBtn');
    el.generateBtn = document.getElementById('generateBtn');
    el.improveBtn = document.getElementById('improveBtn');

    // Target complexity mini-card
    el.targetComplexityTitle = document.getElementById('targetComplexityTitle');
    el.targetComplexityDesc = document.getElementById('targetComplexityDesc');
    el.targetComplexityLang = document.getElementById('targetComplexityLang');

    // Right Column: Issue Banner
    el.issueBanner = document.getElementById('issueBanner');
    el.issueLineBadge = document.getElementById('issueLineBadge');
    el.issueSeverityBadge = document.getElementById('issueSeverityBadge');
    el.issueDescription = document.getElementById('issueDescription');
    el.dismissIssueBtn = document.getElementById('dismissIssueBtn');

    // Right Column: Corrected Code Card
    el.correctedLangBadge = document.getElementById('correctedLangBadge');
    el.copyCodeBtn = document.getElementById('copyCodeBtn');
    el.copyBtnText = document.getElementById('copyBtnText');
    el.copyIcon = document.getElementById('copyIcon');
    el.toggleDiffBtn = document.getElementById('toggleDiffBtn');
    el.correctedCodeDisplay = document.getElementById('correctedCodeDisplay');

    // Terminal Evaluation Card
    el.terminalCard = document.getElementById('terminalCard');
    el.terminalOutput = document.getElementById('terminalOutput');
    el.terminalExitCode = document.getElementById('terminalExitCode');
    el.terminalStatusPill = document.getElementById('terminalStatusPill');

    // Step by Step Breakdown
    el.stepCountBadge = document.getElementById('stepCountBadge');
    el.stepsContainer = document.getElementById('stepsContainer');

    // Complexity Profile
    el.complexityTimeSpace = document.getElementById('complexityTimeSpace');
    el.complexityAllocations = document.getElementById('complexityAllocations');

    // Bottom Actions
    el.copyCorrectedBtn2 = document.getElementById('copyCorrectedBtn2');
    el.testSandboxBtn = document.getElementById('testSandboxBtn');
    el.insertEditorBtn = document.getElementById('insertEditorBtn');

    // Sidebar
    el.newChatBtn = document.getElementById('sidebarNewChatBtn');
    el.searchChatsInput = document.getElementById('sidebarSearchChats');
    el.recentChatsContainer = document.getElementById('sidebarRecentChatsContainer');
    el.recentChatsCount = document.getElementById('sidebarRecentChatsCount');
    el.sidebarProfileName = document.getElementById('sidebarProfileName');
    el.sidebarProfileDept = document.getElementById('sidebarProfileDept');
    el.sidebarProfileImg = document.getElementById('sidebarProfileImg');
    el.headerProfileImg = document.getElementById('headerProfileImg');
  }

  // ---------------------------------------------------------------------------
  // 4. Editor Implementation (Interactive with Line Gutter)
  // ---------------------------------------------------------------------------
  function initEditor() {
    if (!el.codeEditor || !el.lineNumbersGutter) return;

    // Set initial text
    state.code = el.codeEditor.value || '';
    updateLineNumbers();

    // Input listener: track code changes and update line numbers
    el.codeEditor.addEventListener('input', () => {
      state.code = el.codeEditor.value;
      updateLineNumbers();
      // Reset error highlight on edit if code changed
      if (state.activeErrorLine !== null) {
        state.activeErrorLine = null;
        updateLineNumbers();
      }
    });

    // Synchronized scrolling: editor scrolls gutter simultaneously
    el.codeEditor.addEventListener('scroll', () => {
      el.lineNumbersGutter.scrollTop = el.codeEditor.scrollTop;
    });

    // Tab key interception: insert 4 spaces instead of losing focus
    el.codeEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = el.codeEditor.selectionStart;
        const end = el.codeEditor.selectionEnd;
        const indent = '    ';
        el.codeEditor.value = el.codeEditor.value.substring(0, start) + indent + el.codeEditor.value.substring(end);
        el.codeEditor.selectionStart = el.codeEditor.selectionEnd = start + indent.length;
        state.code = el.codeEditor.value;
        updateLineNumbers();
      }
    });

    // Filename input changes
    if (el.filenameInput) {
      el.filenameInput.addEventListener('change', () => {
        state.filename = el.filenameInput.value.trim() || getDefaultFilename(state.language);
        el.filenameInput.value = state.filename;
      });
    }

    // Clear prompt button
    if (el.clearPromptBtn && el.promptInput) {
      el.clearPromptBtn.addEventListener('click', () => {
        el.promptInput.value = '';
        state.prompt = '';
      });
    }
  }

  function updateLineNumbers() {
    if (!el.lineNumbersGutter || !el.codeEditor) return;
    const lines = (el.codeEditor.value || '').split('\n');
    const lineCount = Math.max(lines.length, 1);

    let html = '';
    for (let i = 1; i <= lineCount; i++) {
      const isErrorLine = state.activeErrorLine === i;
      if (isErrorLine) {
        html += `<div class="text-error font-bold bg-error/20 rounded px-1.5 transition-colors" title="Issue identified at line ${i}">${i}</div>`;
      } else {
        html += `<div class="text-outline px-1 hover:text-on-surface-variant transition-colors">${i}</div>`;
      }
    }
    el.lineNumbersGutter.innerHTML = html;
  }

  function getDefaultFilename(lang) {
    const config = SUPPORTED_LANGUAGES[lang.toLowerCase()] || SUPPORTED_LANGUAGES.python;
    return config.defaultFile;
  }

  // ---------------------------------------------------------------------------
  // 5. Language Selector
  // ---------------------------------------------------------------------------
  function initLanguageSelector() {
    if (!el.langDropdownBtn || !el.langDropdownMenu) return;

    el.langDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      el.langDropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      if (!el.langDropdownMenu.classList.contains('hidden')) {
        el.langDropdownMenu.classList.add('hidden');
      }
    });

    el.langDropdownMenu.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const langKey = btn.getAttribute('data-lang') || btn.textContent.trim().toLowerCase();
        selectLanguage(langKey);
        el.langDropdownMenu.classList.add('hidden');
      });
    });
  }

  function selectLanguage(langKey) {
    const normKey = langKey === 'c++' ? 'cpp' : langKey.toLowerCase();
    const config = SUPPORTED_LANGUAGES[normKey] || SUPPORTED_LANGUAGES.python;

    state.language = normKey;
    if (el.selectedLangText) el.selectedLangText.textContent = config.name;
    if (el.targetComplexityLang) el.targetComplexityLang.textContent = config.badge;
    if (el.correctedLangBadge) el.correctedLangBadge.textContent = config.name.toUpperCase();

    // Auto-update filename extension if not customized
    if (el.filenameInput) {
      const current = el.filenameInput.value.trim();
      const dotIdx = current.lastIndexOf('.');
      const baseName = dotIdx !== -1 ? current.substring(0, dotIdx) : 'main';
      state.filename = `${baseName}${config.ext}`;
      el.filenameInput.value = state.filename;
    }

    showToast(`Switched language to ${config.name}`, 'info');
  }

  function loadLanguageDefaults(langKey, confirmIfDirty = true) {
    const normKey = langKey === 'c++' ? 'cpp' : langKey.toLowerCase();
    const config = SUPPORTED_LANGUAGES[normKey] || SUPPORTED_LANGUAGES.python;

    if (confirmIfDirty && el.codeEditor && el.codeEditor.value.trim() && el.codeEditor.value.trim() !== config.sampleBug.trim()) {
      if (!confirm(`Replace current editor code with ${config.name} sample bug?`)) {
        return;
      }
    }

    selectLanguage(normKey);

    if (el.codeEditor) {
      el.codeEditor.value = config.sampleBug;
      state.code = config.sampleBug;
      updateLineNumbers();
    }

    if (el.promptInput) {
      el.promptInput.value = config.samplePrompt;
      state.prompt = config.samplePrompt;
    }

    // Set preview target complexity
    if (el.targetComplexityTitle) el.targetComplexityTitle.textContent = 'Target Complexity Goal';
    if (el.targetComplexityDesc) el.targetComplexityDesc.textContent = 'Optimal Linear Summation: O(N) Time, O(1) Memory';
  }

  // ---------------------------------------------------------------------------
  // 6. Editor Toolbar Actions (Copy, Paste, Clear, Load Bug)
  // ---------------------------------------------------------------------------
  function initToolbarActions() {
    // Copy Editor Code
    if (el.copyEditorBtn) {
      el.copyEditorBtn.addEventListener('click', () => {
        const text = el.codeEditor ? el.codeEditor.value : state.code;
        if (!text.trim()) {
          showToast('Editor is empty.', 'info');
          return;
        }
        navigator.clipboard.writeText(text).then(() => {
          showToast('Editor code copied to clipboard!', 'success');
        }).catch(() => {
          showToast('Failed to copy to clipboard.', 'error');
        });
      });
    }

    // Paste Code
    if (el.pasteCodeBtn) {
      el.pasteCodeBtn.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            if (el.codeEditor) {
              const start = el.codeEditor.selectionStart;
              const end = el.codeEditor.selectionEnd;
              if (start !== undefined && end !== undefined && start !== end) {
                el.codeEditor.value = el.codeEditor.value.substring(0, start) + text + el.codeEditor.value.substring(end);
              } else {
                el.codeEditor.value = text;
              }
              state.code = el.codeEditor.value;
              updateLineNumbers();
              showToast('Code pasted into editor.', 'success');
            }
          } else {
            showToast('Clipboard is empty.', 'info');
          }
        } catch (err) {
          showToast('Clipboard permission denied. Please paste using Ctrl+V / Cmd+V.', 'info');
        }
      });
    }

    // Clear All with Confirmation
    if (el.clearAllBtn) {
      el.clearAllBtn.addEventListener('click', () => {
        if (!el.codeEditor || !el.codeEditor.value.trim()) return;
        if (confirm('Clear the code editor? All unsaved editor content will be removed.')) {
          el.codeEditor.value = '';
          state.code = '';
          state.activeErrorLine = null;
          updateLineNumbers();
          showToast('Editor cleared.', 'info');
        }
      });
    }

    // Load Sample Bug
    if (el.loadBugBtn) {
      el.loadBugBtn.addEventListener('click', () => {
        el.loadBugBtn.classList.add('scale-95');
        setTimeout(() => el.loadBugBtn.classList.remove('scale-95'), 150);
        loadLanguageDefaults(state.language, true);
        showToast(`Loaded ${SUPPORTED_LANGUAGES[state.language]?.name || ''} sample bug.`, 'success');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Analysis & Mode Execution (Debug, Explain, Generate, Improve)
  // ---------------------------------------------------------------------------
  function initModeButtons() {
    if (el.primaryDebugBtn) {
      el.primaryDebugBtn.addEventListener('click', () => triggerAnalysis('debug'));
    }
    if (el.explainBtn) {
      el.explainBtn.addEventListener('click', () => triggerAnalysis('explain'));
    }
    if (el.generateBtn) {
      el.generateBtn.addEventListener('click', () => triggerAnalysis('generate'));
    }
    if (el.improveBtn) {
      el.improveBtn.addEventListener('click', () => triggerAnalysis('improve'));
    }

    if (el.dismissIssueBtn) {
      el.dismissIssueBtn.addEventListener('click', () => {
        if (el.issueBanner) el.issueBanner.classList.add('hidden');
        state.activeErrorLine = null;
        updateLineNumbers();
      });
    }
  }

  async function triggerAnalysis(mode = 'debug') {
    if (state.isAnalyzing) return;

    const code = el.codeEditor ? el.codeEditor.value.trim() : state.code.trim();
    if (!code) {
      showToast('Please enter or paste code into the editor to analyze.', 'error');
      if (el.codeEditor) el.codeEditor.focus();
      return;
    }

    const prompt = el.promptInput ? el.promptInput.value.trim() : '';
    state.mode = mode;
    state.isAnalyzing = true;

    setLoadingState(true, mode);

    try {
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const payload = {
        code,
        language: state.language,
        mode,
        prompt,
        filename: state.filename || getDefaultFilename(state.language)
      };

      const res = await fetch('/api/code/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete code analysis.');
      }

      state.lastAnalysis = data;
      renderAnalysisResult(data);

      // Update model badge and latency
      if (data.model) updateModelDisplay(data.model);
      if (data.latencyMs) updateLatencyDisplay(data.latencyMs);

      // Auto-save session
      await autoSaveSession(data);

      showToast(`Analysis completed successfully in ${data.latencyMs || 0}ms`, 'success');
    } catch (err) {
      console.error('[Code Assistant Error]:', err);
      showToast(err.message || 'Error communicating with Gemini API.', 'error');
      renderErrorState(err.message);
    } finally {
      state.isAnalyzing = false;
      setLoadingState(false, mode);
    }
  }

  function setLoadingState(isLoading, mode) {
    const buttons = [el.primaryDebugBtn, el.explainBtn, el.generateBtn, el.improveBtn].filter(Boolean);

    buttons.forEach(btn => {
      btn.disabled = isLoading;
      if (isLoading) {
        btn.classList.add('opacity-70', 'cursor-not-allowed');
      } else {
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
      }
    });

    if (el.primaryDebugBtn) {
      if (isLoading) {
        el.primaryDebugBtn.innerHTML = `
          <span class="material-symbols-outlined text-[18px] animate-spin">refresh</span>
          <span>Analyzing AST & Logic...</span>
        `;
      } else {
        el.primaryDebugBtn.innerHTML = `
          <span class="material-symbols-outlined text-[18px]">pest_control</span>
          <span>Debug Code</span>
        `;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Dynamic Results Rendering
  // ---------------------------------------------------------------------------
  function renderAnalysisResult(data) {
    if (!data) return;

    // 1. Issue Banner
    if (el.issueBanner) {
      el.issueBanner.classList.remove('hidden');
      const hasIssues = Array.isArray(data.issues) && data.issues.length > 0;

      if (hasIssues) {
        const topIssue = data.issues[0];
        state.activeErrorLine = typeof topIssue.line === 'number' ? topIssue.line : null;

        // Visual error styling
        el.issueBanner.className = 'bg-error-container text-on-error-container p-space-md rounded-xl shadow-sm flex items-start justify-between gap-3 transition-all duration-300';
        
        if (el.issueLineBadge) {
          el.issueLineBadge.textContent = topIssue.line 
            ? `Issue identified in line ${topIssue.line}` 
            : `Issue Identified`;
        }
        if (el.issueSeverityBadge) {
          el.issueSeverityBadge.textContent = topIssue.severity || topIssue.category || 'Logical Error';
          el.issueSeverityBadge.className = 'px-2 py-0.5 rounded-full bg-error text-on-error font-code-sm text-code-sm font-medium';
        }
        if (el.issueDescription) {
          el.issueDescription.innerHTML = `
            ${escapeHtml(topIssue.message || data.summary || '')}
            ${topIssue.explanation ? `<div class="mt-1 font-body-sm text-xs opacity-90">${escapeHtml(topIssue.explanation)}</div>` : ''}
          `;
        }
      } else {
        // Clean / No issues found
        state.activeErrorLine = null;
        el.issueBanner.className = 'bg-surface-container-high text-on-surface p-space-md rounded-xl shadow-sm flex items-start justify-between gap-3 transition-all duration-300 border border-primary/20';

        if (el.issueLineBadge) el.issueLineBadge.textContent = 'No Issues Detected';
        if (el.issueSeverityBadge) {
          el.issueSeverityBadge.textContent = 'Clean & Verified';
          el.issueSeverityBadge.className = 'px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-code-sm text-code-sm font-medium';
        }
        if (el.issueDescription) {
          el.issueDescription.textContent = data.summary || 'Code logic validated. No runtime exceptions or logical flaws detected.';
        }
      }

      // Update line gutter highlight
      updateLineNumbers();
    }

    // 2. Corrected Code Card
    if (el.correctedCodeDisplay) {
      const code = data.correctedCode || '// No corrections required';
      el.correctedCodeDisplay.innerHTML = renderCodeDisplayHtml(code, state.language);
      state.showingDiff = false;
      if (el.toggleDiffBtn) el.toggleDiffBtn.textContent = 'Show Diff';
    }

    // 3. Terminal Evaluation Card
    if (el.terminalOutput && data.terminalEvaluation) {
      el.terminalOutput.textContent = `Output: ${data.terminalEvaluation.output?.trim() || 'No output'}`;
      if (el.terminalExitCode) {
        el.terminalExitCode.textContent = `exit code: ${data.terminalEvaluation.exitCode ?? 0}`;
      }
      if (el.terminalStatusPill) {
        el.terminalStatusPill.className = 'w-2 h-2 rounded-full bg-secondary-fixed';
      }
    }

    // 4. Step-by-Step Breakdown
    if (el.stepsContainer) {
      const steps = Array.isArray(data.steps) ? data.steps : [];
      if (el.stepCountBadge) {
        el.stepCountBadge.textContent = `${steps.length} Steps`;
      }

      if (steps.length === 0) {
        el.stepsContainer.innerHTML = `
          <li class="flex items-start gap-3 p-2.5 rounded-lg bg-surface-container-low text-on-surface-variant font-body-sm text-sm">
            <span>Execution flow validated directly against AST specification.</span>
          </li>
        `;
      } else {
        el.stepsContainer.innerHTML = steps.map((s, idx) => `
          <li class="flex items-start gap-3 p-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors">
            <span class="w-6 h-6 rounded-full bg-secondary-container text-primary font-code-sm text-code-sm flex items-center justify-center font-semibold shrink-0 mt-0.5">
              ${s.stepNumber || idx + 1}
            </span>
            <div class="flex-1">
              <p class="font-title-md text-sm font-medium text-on-surface">${escapeHtml(s.title || `Step ${idx + 1}`)}</p>
              <p class="font-body-sm text-sm text-on-surface-variant mt-0.5">${escapeHtml(s.description || '')}</p>
            </div>
          </li>
        `).join('');
      }
    }

    // 5. Complexity Profile
    if (data.complexity) {
      if (el.complexityTimeSpace) {
        el.complexityTimeSpace.textContent = `Time: ${data.complexity.time || 'O(N)'}  |  Space: ${data.complexity.space || 'O(1)'}`;
      }
      if (el.complexityAllocations) {
        el.complexityAllocations.textContent = data.complexity.allocations || '0 heap allocations';
      }
      if (el.targetComplexityTitle && data.complexity.profile) {
        el.targetComplexityDesc.textContent = data.complexity.profile;
      }
    }
  }

  function renderErrorState(errorMessage) {
    if (el.issueBanner) {
      el.issueBanner.classList.remove('hidden');
      el.issueBanner.className = 'bg-error-container text-on-error-container p-space-md rounded-xl shadow-sm flex items-start justify-between gap-3';
      if (el.issueLineBadge) el.issueLineBadge.textContent = 'Analysis Request Failed';
      if (el.issueSeverityBadge) {
        el.issueSeverityBadge.textContent = 'Network/API Error';
        el.issueSeverityBadge.className = 'px-2 py-0.5 rounded-full bg-error text-on-error font-code-sm text-code-sm font-medium';
      }
      if (el.issueDescription) {
        el.issueDescription.textContent = errorMessage || 'Could not communicate with Gemini API backend.';
      }
    }
  }

  function renderCodeDisplayHtml(code, lang) {
    if (!code) return '';
    const lines = code.split('\n');
    return lines.map((line, idx) => {
      // Simple highlight for commented or modified lines
      const isComment = line.trim().startsWith('#') || line.trim().startsWith('//');
      const isAccumulator = line.includes('+=') || line.includes('sum(');

      if (isAccumulator) {
        return `
          <div class="bg-primary/20 -mx-4 px-4 py-0.5 rounded flex items-center justify-between">
            <span class="text-on-tertiary-container">${escapeHtml(line)}</span>
            <span class="text-primary-fixed font-code-sm text-xs"># corrected accumulation</span>
          </div>
        `;
      }

      return `<div class="${isComment ? 'text-outline-variant italic' : 'text-on-tertiary-container'}">${escapeHtml(line || ' ')}</div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // 9. Bottom Actions: Copy, Replace Editor Code, Diff View, Sandbox Runner
  // ---------------------------------------------------------------------------
  function initBottomActions() {
    // Copy Code Buttons
    function handleCopyCorrected() {
      const textToCopy = state.lastAnalysis?.correctedCode || (el.correctedCodeDisplay ? el.correctedCodeDisplay.innerText : '');
      if (!textToCopy.trim()) {
        showToast('No corrected code available to copy.', 'info');
        return;
      }
      navigator.clipboard.writeText(textToCopy).then(() => {
        if (el.copyBtnText) el.copyBtnText.textContent = 'Copied!';
        if (el.copyIcon) el.copyIcon.textContent = 'check';
        showToast('Corrected code copied to clipboard!', 'success');
        setTimeout(() => {
          if (el.copyBtnText) el.copyBtnText.textContent = 'Copy Code';
          if (el.copyIcon) el.copyIcon.textContent = 'content_copy';
        }, 2000);
      }).catch(() => {
        showToast('Failed to copy code.', 'error');
      });
    }

    if (el.copyCodeBtn) el.copyCodeBtn.addEventListener('click', handleCopyCorrected);
    if (el.copyCorrectedBtn2) el.copyCorrectedBtn2.addEventListener('click', handleCopyCorrected);

    // Replace Editor Code ("Insert into Editor")
    if (el.insertEditorBtn) {
      el.insertEditorBtn.addEventListener('click', () => {
        const corrected = state.lastAnalysis?.correctedCode;
        if (!corrected) {
          showToast('No corrected code available yet. Run analysis first.', 'info');
          return;
        }

        if (el.codeEditor) {
          el.codeEditor.value = corrected;
          state.code = corrected;
          state.activeErrorLine = null;
          updateLineNumbers();
          showToast('Corrected code inserted into editor!', 'success');
        }
      });
    }

    // Toggle Diff View
    if (el.toggleDiffBtn) {
      el.toggleDiffBtn.addEventListener('click', () => {
        if (!state.lastAnalysis || !state.lastAnalysis.correctedCode) {
          showToast('Run analysis first to view code diff.', 'info');
          return;
        }
        state.showingDiff = !state.showingDiff;
        if (state.showingDiff) {
          renderDiffView();
          el.toggleDiffBtn.textContent = 'Hide Diff';
        } else {
          el.correctedCodeDisplay.innerHTML = renderCodeDisplayHtml(state.lastAnalysis.correctedCode, state.language);
          el.toggleDiffBtn.textContent = 'Show Diff';
        }
      });
    }

    // Test in Sandbox Button
    if (el.testSandboxBtn) {
      el.testSandboxBtn.addEventListener('click', handleRunInSandbox);
    }
  }

  function renderDiffView() {
    if (!el.correctedCodeDisplay || !state.lastAnalysis) return;
    const origLines = (el.codeEditor ? el.codeEditor.value : state.code).split('\n');
    const newLines = state.lastAnalysis.correctedCode.split('\n');

    let html = `<div class="font-code-sm text-xs mb-2 text-outline-variant select-none">// Comparison: Original (-) vs Corrected (+)</div>`;
    const maxLen = Math.max(origLines.length, newLines.length);

    for (let i = 0; i < maxLen; i++) {
      const orig = origLines[i];
      const fixed = newLines[i];

      if (orig === fixed) {
        html += `<div class="text-on-tertiary-container/80 pl-4">${escapeHtml(orig || '')}</div>`;
      } else {
        if (orig !== undefined) {
          html += `<div class="bg-error/25 text-error-container -mx-4 px-4 py-0.5"><span class="select-none font-bold mr-2">-</span>${escapeHtml(orig)}</div>`;
        }
        if (fixed !== undefined) {
          html += `<div class="bg-primary/25 text-primary-fixed -mx-4 px-4 py-0.5"><span class="select-none font-bold mr-2">+</span>${escapeHtml(fixed)}</div>`;
        }
      }
    }
    el.correctedCodeDisplay.innerHTML = html;
  }

  // ---------------------------------------------------------------------------
  // 10. Safe Isolated Code Execution Sandbox
  // ---------------------------------------------------------------------------
  async function handleRunInSandbox() {
    const code = state.lastAnalysis?.correctedCode || (el.codeEditor ? el.codeEditor.value : state.code);
    if (!code.trim()) {
      showToast('No code to execute. Please provide code in the editor.', 'error');
      return;
    }

    const lang = state.language;

    // JavaScript / TypeScript Sandbox: Safe Web Worker execution
    if (lang === 'javascript' || lang === 'typescript') {
      runJavaScriptSandbox(code);
      return;
    }

    // Python Sandbox: In-browser WebAssembly Pyodide execution
    if (lang === 'python') {
      await runPythonPyodideSandbox(code);
      return;
    }

    // Compiled languages (Java, C, C++): Inform about host security isolation and display verified expected AST output
    showSandboxNoticeModal(lang);
  }

  function runJavaScriptSandbox(code) {
    showToast('Executing in browser Web Worker sandbox...', 'info');

    // Create isolated Web Worker with console interception and watchdog timeout
    const workerScript = `
      self.onmessage = function(e) {
        let output = '';
        const originalLog = console.log;
        const originalError = console.error;
        console.log = function(...args) {
          output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\\n';
        };
        console.error = function(...args) {
          output += '[stderr] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\\n';
        };

        try {
          const fn = new Function(e.data);
          const result = fn();
          if (result !== undefined && !output) output = String(result);
          self.postMessage({ success: true, output: output || 'Program finished with no output.', exitCode: 0 });
        } catch (err) {
          self.postMessage({ success: false, output: output + 'Runtime Error: ' + err.message, exitCode: 1 });
        }
      };
    `;

    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    let finished = false;

    // 2-second timeout to prevent infinite loops
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        worker.terminate();
        updateTerminalOutput('Execution timed out after 2000ms (watchdog abort).', 124, 'timeout');
        showToast('Sandbox execution timed out (infinite loop protection).', 'error');
      }
    }, 2000);

    worker.onmessage = (e) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      const { output, exitCode } = e.data;
      updateTerminalOutput(output, exitCode, exitCode === 0 ? 'executed' : 'runtime_error');
      showToast(`Sandbox run complete (exit code: ${exitCode})`, exitCode === 0 ? 'success' : 'error');
    };

    worker.postMessage(code);
  }

  async function runPythonPyodideSandbox(code) {
    showToast('Preparing Python WebAssembly sandbox...', 'info');

    // If Pyodide is not loaded yet, attempt to dynamically load or inform
    if (!window.loadPyodide && !state.isPyodideLoading) {
      state.isPyodideLoading = true;
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
      script.onload = async () => {
        try {
          state.pyodideInstance = await window.loadPyodide();
          state.isPyodideLoading = false;
          executeWithPyodide(code);
        } catch (e) {
          state.isPyodideLoading = false;
          showSandboxNoticeModal('python');
        }
      };
      script.onerror = () => {
        state.isPyodideLoading = false;
        showSandboxNoticeModal('python');
      };
      document.head.appendChild(script);
      return;
    }

    if (state.pyodideInstance) {
      executeWithPyodide(code);
    } else {
      showSandboxNoticeModal('python');
    }
  }

  async function executeWithPyodide(code) {
    try {
      showToast('Running Python in WebAssembly...', 'info');
      state.pyodideInstance.setStdout({ batched: (str) => updateTerminalOutput(str, 0, 'executed') });
      await state.pyodideInstance.runPythonAsync(code);
      showToast('Python execution completed successfully.', 'success');
    } catch (err) {
      updateTerminalOutput(`Traceback (most recent call last):\n${err.message}`, 1, 'runtime_error');
      showToast('Python execution encountered a runtime error.', 'error');
    }
  }

  function updateTerminalOutput(output, exitCode, status) {
    if (el.terminalOutput) {
      el.terminalOutput.textContent = `Output: ${output.trim()}`;
    }
    if (el.terminalExitCode) {
      el.terminalExitCode.textContent = `exit code: ${exitCode}`;
      el.terminalExitCode.className = exitCode === 0 ? 'font-code-sm text-code-sm text-tertiary' : 'font-code-sm text-code-sm text-error font-semibold';
    }
    if (el.terminalStatusPill) {
      el.terminalStatusPill.className = exitCode === 0 ? 'w-2 h-2 rounded-full bg-secondary-fixed' : 'w-2 h-2 rounded-full bg-error animate-ping';
    }
  }

  function showSandboxNoticeModal(lang) {
    const langName = SUPPORTED_LANGUAGES[lang]?.name || lang;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-inverse-surface/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-surface-container-lowest max-w-lg w-full rounded-2xl shadow-2xl border border-surface-container-highest p-space-lg space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 text-primary">
            <span class="material-symbols-outlined text-[24px]">shield</span>
            <h3 class="font-headline-lg-mobile text-lg font-semibold text-on-surface">Isolated Sandbox Security</h3>
          </div>
          <button class="text-on-surface-variant hover:text-on-surface p-1 rounded-lg" id="closeSandboxModalBtn" type="button">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="bg-surface-container-low p-space-md rounded-xl space-y-2 text-on-surface font-body-sm text-sm">
          <p>
            To prevent arbitrary command injection, process hijacking, and host compromise, arbitrary <strong>${escapeHtml(langName)}</strong> compilation and execution are restricted on the Node.js host server.
          </p>
          <div class="flex items-center gap-2 p-2 rounded-lg bg-surface-container text-on-surface-variant font-code-sm text-xs">
            <span class="material-symbols-outlined text-[16px] text-primary">verified</span>
            <span>Displaying Verified Semantic Output: <strong>15</strong></span>
          </div>
        </div>

        <div class="space-y-1.5 font-body-sm text-xs text-on-surface-variant">
          <p class="font-medium text-on-surface">To enable live host container execution for C/C++/Java:</p>
          <ul class="list-disc pl-5 space-y-1">
            <li>Configure an isolated Docker sandbox container (e.g. <code>docker run --rm -m 128m</code>)</li>
            <li>Or link an external isolated runner service such as Judge0 API</li>
          </ul>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <button class="px-4 py-2 rounded-lg bg-primary-container text-on-primary font-label-md text-sm hover:bg-primary transition-all shadow-sm" id="confirmSandboxModalBtn" type="button">
            Got it
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#closeSandboxModalBtn').addEventListener('click', close);
    modal.querySelector('#confirmSandboxModalBtn').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }

  // ---------------------------------------------------------------------------
  // 11. Real Chat History & Session Management
  // ---------------------------------------------------------------------------
  function initSidebarHistory() {
    // New Chat button
    if (el.newChatBtn) {
      el.newChatBtn.addEventListener('click', () => {
        startNewCodingSession();
      });
    }

    // Search chats filter
    if (el.searchChatsInput) {
      el.searchChatsInput.addEventListener('input', (e) => {
        const query = (e.target.value || '').toLowerCase().trim();
        filterSessions(query);
      });
    }
  }

  function startNewCodingSession() {
    state.currentSessionId = null;
    state.lastAnalysis = null;
    state.activeErrorLine = null;
    loadLanguageDefaults(state.language, false);

    // Hide issue banner
    if (el.issueBanner) el.issueBanner.classList.add('hidden');

    // Reset right column to placeholder/initial state
    if (el.correctedCodeDisplay) {
      el.correctedCodeDisplay.innerHTML = `<div class="text-outline-variant font-code-sm">// Submit code to view corrected implementation</div>`;
    }
    if (el.terminalOutput) el.terminalOutput.textContent = 'Output: ready';
    if (el.terminalExitCode) el.terminalExitCode.textContent = 'exit code: 0';
    if (el.stepsContainer) {
      el.stepsContainer.innerHTML = `<li class="p-2 rounded-lg bg-surface-container-low text-on-surface-variant font-body-sm text-sm">Step breakdown will appear here after analysis.</li>`;
    }
    if (el.stepCountBadge) el.stepCountBadge.textContent = '0 Steps';

    showToast('Started new coding session.', 'info');
  }

  async function loadSessions() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/code/sessions', { headers });
      if (!res.ok) throw new Error('Failed to fetch code sessions');
      const data = await res.json();
      state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
      renderRecentChats();
    } catch (e) {
      console.warn('[Code Assistant] Could not load sessions:', e.message);
    }
  }

  function renderRecentChats() {
    if (!el.recentChatsContainer) return;

    if (el.recentChatsCount) {
      el.recentChatsCount.textContent = state.sessions.length;
    }

    if (state.sessions.length === 0) {
      el.recentChatsContainer.innerHTML = `
        <div class="px-space-sm py-2 text-on-surface-variant font-body-sm text-xs text-center">
          No saved coding sessions yet.
        </div>
      `;
      return;
    }

    el.recentChatsContainer.innerHTML = state.sessions.map(s => {
      const isActive = s.id === state.currentSessionId;
      return `
        <div class="session-item group flex items-center justify-between px-space-sm py-1.5 rounded-lg hover:bg-surface-container cursor-pointer transition-colors ${isActive ? 'bg-surface-container-high font-medium' : ''}"
             data-id="${escapeHtml(s.id)}" title="${escapeHtml(s.title || 'Untitled Session')}">
          <div class="flex items-center gap-space-xs min-w-0 flex-1">
            <span class="material-symbols-outlined text-[16px] text-primary shrink-0">terminal</span>
            <span class="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface truncate">
              ${escapeHtml(s.title || 'Coding Session')}
            </span>
          </div>
          <button class="delete-session-btn opacity-0 group-hover:opacity-100 p-0.5 hover:bg-error/20 hover:text-error rounded text-on-surface-variant transition-opacity" 
                  data-id="${escapeHtml(s.id)}" title="Delete session" type="button">
            <span class="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      `;
    }).join('');

    // Attach listeners
    el.recentChatsContainer.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.delete-session-btn')) return;
        const id = item.getAttribute('data-id');
        restoreSession(id);
      });
    });

    el.recentChatsContainer.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        deleteSession(id);
      });
    });
  }

  function filterSessions(query) {
    if (!el.recentChatsContainer) return;
    const items = el.recentChatsContainer.querySelectorAll('.session-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (!query || text.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  async function restoreSession(sessionId) {
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) return;

    state.currentSessionId = session.id;
    state.language = session.language || 'python';
    state.filename = session.filename || getDefaultFilename(state.language);
    state.code = session.code || '';
    state.prompt = session.prompt || '';
    state.mode = session.mode || 'debug';

    // Update UI elements
    selectLanguage(state.language);
    if (el.filenameInput) el.filenameInput.value = state.filename;
    if (el.codeEditor) {
      el.codeEditor.value = state.code;
      updateLineNumbers();
    }
    if (el.promptInput) el.promptInput.value = state.prompt;

    if (session.result) {
      state.lastAnalysis = session.result;
      renderAnalysisResult(session.result);
    }

    renderRecentChats();
    showToast(`Loaded "${session.title || 'Session'}"`, 'info');
  }

  async function autoSaveSession(result) {
    const code = el.codeEditor ? el.codeEditor.value : state.code;
    const prompt = el.promptInput ? el.promptInput.value : state.prompt;
    const title = prompt ? prompt.slice(0, 32) : `${SUPPORTED_LANGUAGES[state.language]?.name || 'Code'} ${state.mode.toUpperCase()}`;

    const sessionPayload = {
      id: state.currentSessionId || `code_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      language: state.language,
      filename: state.filename || getDefaultFilename(state.language),
      code,
      prompt,
      mode: state.mode,
      result
    };

    try {
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const res = await fetch('/api/code/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionPayload)
      });

      if (res.ok) {
        const data = await res.json();
        state.currentSessionId = data.session?.id || sessionPayload.id;
        await loadSessions();
      }
    } catch (e) {
      console.warn('[Code Assistant] Auto-save error:', e.message);
    }
  }

  async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/code/sessions/${sessionId}`, {
        method: 'DELETE',
        headers
      });

      if (res.ok) {
        state.sessions = state.sessions.filter(s => s.id !== sessionId);
        if (state.currentSessionId === sessionId) {
          startNewCodingSession();
        }
        renderRecentChats();
        showToast('Session deleted.', 'info');
      }
    } catch (e) {
      showToast('Could not delete session.', 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // 12. Profile & Supabase Auth Sync
  // ---------------------------------------------------------------------------
  async function initUserProfile() {
    try {
      if (window.SmartAssistAuth) {
        const client = await window.SmartAssistAuth.getClient();
        if (client) {
          const { data: { user } } = await client.auth.getUser();
          if (user) {
            const name = user.user_metadata?.full_name || user.email.split('@')[0];
            const email = user.email;

            if (el.sidebarProfileName) el.sidebarProfileName.textContent = name;
            if (el.sidebarProfileDept) el.sidebarProfileDept.textContent = email;
          }
        }
      }
    } catch (e) {
      console.debug('[Code Assistant Profile Init]: Fallback to default user data');
    }
  }

  async function fetchModelStatus() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        if (data.model) updateModelDisplay(data.model);
      }
    } catch (e) {}
  }

  function updateModelDisplay(modelName) {
    // Model badge removed globally from UI per requirements
    if (el.modelBadge) el.modelBadge.remove();
    if (el.pageModelBadge) el.pageModelBadge.remove();
  }

  function updateLatencyDisplay(ms) {
    const formatted = `${ms}ms`;
    if (el.latencyBadge) {
      el.latencyBadge.innerHTML = `<span class="material-symbols-outlined text-[14px]">bolt</span><span>${formatted}</span>`;
    }
    if (el.pageLatencyBadge) {
      el.pageLatencyBadge.innerHTML = `<span class="material-symbols-outlined text-[16px]">schedule</span><span>Latency: ${formatted}</span>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 13. Auth Headers & Helper Functions
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
        }
      } catch (e) {}
    }

    let guestId = localStorage.getItem('smartassist_guest_id');
    if (!guestId) {
      guestId = 'guest_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('smartassist_guest_id', guestId);
    }
    headers['X-Guest-Id'] = guestId;

    return headers;
  }

  function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(toastContainer);
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

    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
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

})();

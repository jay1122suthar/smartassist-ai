/**
 * SmartAssist AI — Unified Chat Composer Engine
 * Handles file attachments (PDF, TXT, MD, Code), RAG PDF grounded chat,
 * Web Speech API voice dictation, and cross-screen submission synchronization.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Configuration & Supported Formats
  // ---------------------------------------------------------------------------
  const ALLOWED_EXTENSIONS = [
    '.pdf',
    '.txt', '.md', '.json', '.csv',
    '.js', '.ts', '.py', '.html', '.css',
    '.java', '.c', '.cpp', '.h', '.sql', '.sh', '.xml', '.yaml', '.yml'
  ];

  const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
  const MAX_TEXT_BYTES = 10 * 1024 * 1024; // 10 MB

  // ---------------------------------------------------------------------------
  // 2. State
  // ---------------------------------------------------------------------------
  let stagedAttachment = null;
  let isUploading = false;
  let isListening = false;
  let speechRecognizer = null;
  let initialVoiceText = '';

  // ---------------------------------------------------------------------------
  // 3. UI Helpers (Toasts, Formatting, Escape HTML)
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileIcon(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['py', 'js', 'ts', 'java', 'c', 'cpp', 'h', 'html', 'css', 'sql', 'sh'].includes(ext)) {
      return 'terminal';
    }
    return 'description';
  }

  function showToast(message, type = 'info') {
    let container = document.getElementById('chat-composer-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'chat-composer-toast-container';
      container.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const isError = type === 'error';
    const isSuccess = type === 'success';

    toast.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-xl border text-sm flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 ${
      isError
        ? 'bg-error-container text-on-error-container border-error/30'
        : isSuccess
        ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800'
        : 'bg-surface-container-highest text-on-surface border-surface-container'
    }`;

    const icon = isError ? 'error' : isSuccess ? 'check_circle' : 'info';
    toast.innerHTML = `
      <span class="material-symbols-outlined text-[18px] shrink-0">${icon}</span>
      <span class="flex-1 font-body-sm text-body-sm leading-snug">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-4', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // ---------------------------------------------------------------------------
  // 4. Staged Attachment Card Rendering & Management
  // ---------------------------------------------------------------------------
  function renderAttachmentPreview(container, file, status = 'uploading') {
    if (!container) return;

    if (!file) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    const iconName = getFileIcon(file.name || file.filename || '');
    const isPdf = iconName === 'picture_as_pdf';
    const sizeStr = formatBytes(file.size || file.fileSize || 0);
    const displayName = file.name || file.filename || 'Attached file';

    let statusHtml = '';
    if (status === 'uploading') {
      statusHtml = `
        <div class="flex items-center gap-1.5 text-xs text-primary font-medium">
          <svg class="animate-spin h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Uploading &amp; extracting...</span>
        </div>
      `;
    } else if (status === 'ready') {
      const extraMeta = isPdf && file.pageCount ? `${file.pageCount} pages • ` : '';
      statusHtml = `
        <div class="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <span class="material-symbols-outlined text-[14px]">check_circle</span>
          <span>${extraMeta}Ready to send</span>
        </div>
      `;
    } else if (status === 'error') {
      statusHtml = `
        <div class="flex items-center gap-1 text-xs text-error font-medium">
          <span class="material-symbols-outlined text-[14px]">error</span>
          <span>Upload failed</span>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-container/70 border border-outline-variant/30 backdrop-blur-sm">
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="w-9 h-9 rounded-lg ${isPdf ? 'bg-red-500/10 text-red-600' : 'bg-primary/10 text-primary'} flex items-center justify-center shrink-0 shadow-xs">
            <span class="material-symbols-outlined text-[20px]">${iconName}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-label-md text-label-md text-on-surface font-semibold truncate max-w-[280px]" title="${escapeHtml(displayName)}">
                ${escapeHtml(displayName)}
              </span>
              <span class="font-code-sm text-code-sm text-on-surface-variant/80 shrink-0">
                ${escapeHtml(sizeStr)}
              </span>
            </div>
            ${statusHtml}
          </div>
        </div>
        <button type="button" class="composer-remove-attachment p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-surface-container-high transition-colors shrink-0" title="Remove attachment">
          <span class="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    `;

    const removeBtn = container.querySelector('.composer-remove-attachment');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        stagedAttachment = null;
        isUploading = false;
        container.innerHTML = '';
        container.classList.add('hidden');
        const fileInputs = document.querySelectorAll('.chat-hidden-file-input');
        fileInputs.forEach(i => { i.value = ''; });
        showToast('Attachment removed', 'info');
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Upload File to Backend
  // ---------------------------------------------------------------------------
  async function uploadChatAttachment(file, previewContainer) {
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();

    // 1. Client-Side Format Validation
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      showToast(`Unsupported file type (${ext}). Supported: PDF (.pdf), Text (.txt, .md, .csv, .json), and Code (.py, .js, .java, .cpp, .html, .css).`, 'error');
      renderAttachmentPreview(previewContainer, null);
      return;
    }

    // 2. Client-Side Size Validation
    const isPdf = ext === '.pdf';
    const maxSize = isPdf ? MAX_PDF_BYTES : MAX_TEXT_BYTES;
    if (file.size > maxSize) {
      const maxMb = isPdf ? '50 MB' : '10 MB';
      showToast(`File exceeds the ${maxMb} limit for ${isPdf ? 'PDFs' : 'text/code files'}.`, 'error');
      renderAttachmentPreview(previewContainer, null);
      return;
    }

    // 3. Render Uploading State
    isUploading = true;
    renderAttachmentPreview(previewContainer, file, 'uploading');

    const formData = new FormData();
    formData.append('file', file, file.name);

    try {
      // Pass auth token if available
      const headers = {};
      const token = localStorage.getItem('smartassist_token') || sessionStorage.getItem('smartassist_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.attachment) {
        throw new Error(data.error || 'Upload failed');
      }

      stagedAttachment = data.attachment;
      isUploading = false;
      renderAttachmentPreview(previewContainer, stagedAttachment, 'ready');
      showToast(`Attached ${stagedAttachment.filename} successfully.`, 'success');
    } catch (err) {
      isUploading = false;
      stagedAttachment = null;
      renderAttachmentPreview(previewContainer, file, 'error');
      showToast(`Failed to upload attachment: ${err.message}`, 'error');
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Voice Dictation (Web Speech API)
  // ---------------------------------------------------------------------------
  function toggleVoiceDictation(micBtn, textarea) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast('Voice dictation is not supported by your current browser. Please type your message or try Google Chrome / Microsoft Edge.', 'info');
      return;
    }

    if (isListening && speechRecognizer) {
      speechRecognizer.stop();
      isListening = false;
      updateMicButtonUI(micBtn, false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      speechRecognizer = recognition;
      initialVoiceText = textarea.value || '';

      recognition.onstart = () => {
        isListening = true;
        updateMicButtonUI(micBtn, true);
        showToast('Listening... Speak now.', 'info');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }

        const base = initialVoiceText.trim();
        textarea.value = (base ? base + ' ' : '') + transcript.trim();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      };

      recognition.onerror = (event) => {
        isListening = false;
        updateMicButtonUI(micBtn, false);
        if (event.error === 'not-allowed') {
          showToast('Microphone access was denied. Please allow microphone permissions in site settings to use voice input.', 'error');
        } else if (event.error === 'no-speech') {
          // Subtle notice, do not spam
        } else {
          showToast(`Voice input error: ${event.error}`, 'error');
        }
      };

      recognition.onend = () => {
        isListening = false;
        updateMicButtonUI(micBtn, false);
      };

      recognition.start();
    } catch (e) {
      isListening = false;
      updateMicButtonUI(micBtn, false);
      showToast('Could not initialize microphone: ' + e.message, 'error');
    }
  }

  function updateMicButtonUI(micBtn, active) {
    if (!micBtn) return;
    if (active) {
      micBtn.classList.add('bg-error/15', 'text-error', 'ring-2', 'ring-error/40', 'animate-pulse');
      micBtn.title = 'Listening... Click to stop';
      const icon = micBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'mic';
    } else {
      micBtn.classList.remove('bg-error/15', 'text-error', 'ring-2', 'ring-error/40', 'animate-pulse');
      micBtn.title = 'Voice dictation';
      const icon = micBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = 'mic';
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Page-Specific Initializations
  // ---------------------------------------------------------------------------

  function setupDashboardPage() {
    const input = document.getElementById('mainInput');
    const sendBtn = document.getElementById('sendBtn');
    if (!input || !sendBtn) return;

    // 1. Create or bind attachment preview container
    let previewContainer = document.getElementById('attachment-preview-container');
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'attachment-preview-container';
      previewContainer.className = 'w-full mb-2 hidden';
      input.closest('.relative').before(previewContainer);
    }

    // 2. Hidden file inputs
    let fileInput = document.getElementById('dashboard-file-input');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'dashboard-file-input';
      fileInput.className = 'chat-hidden-file-input hidden';
      fileInput.accept = ALLOWED_EXTENSIONS.join(',');
      document.body.appendChild(fileInput);
    }

    let pdfInput = document.getElementById('dashboard-pdf-input');
    if (!pdfInput) {
      pdfInput = document.createElement('input');
      pdfInput.type = 'file';
      pdfInput.id = 'dashboard-pdf-input';
      pdfInput.className = 'chat-hidden-file-input hidden';
      pdfInput.accept = '.pdf';
      document.body.appendChild(pdfInput);
    }

    // 3. Bind Buttons
    const composerButtons = Array.from(input.closest('.w-full.rounded-2xl').querySelectorAll('button'));

    const attachBtn = composerButtons.find(b => {
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      return text.trim() === 'attach_file';
    });
    const pdfBtn = composerButtons.find(b => {
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      return text.trim() === 'upload_file';
    });
    const micBtn = composerButtons.find(b => {
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      return text.trim() === 'mic';
    });

    if (attachBtn) {
      attachBtn.id = 'dashboard-attach-btn';
      attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });
    }

    if (pdfBtn) {
      pdfBtn.id = 'dashboard-pdf-btn';
      pdfBtn.addEventListener('click', (e) => {
        e.preventDefault();
        pdfInput.click();
      });
    }

    if (micBtn) {
      micBtn.id = 'dashboard-mic-btn';
      micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleVoiceDictation(micBtn, input);
      });
    }

    // File input changes
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) uploadChatAttachment(file, previewContainer);
    });

    pdfInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) uploadChatAttachment(file, previewContainer);
    });

    // 4. Submit handler for Screen 01 -> routes to Screen 02 with prompt & attachment
    function submitDashboard() {
      if (isUploading) {
        showToast('Please wait for the attachment to finish uploading...', 'info');
        return;
      }

      const text = (input.value || '').trim();
      if (!text && !stagedAttachment) {
        showToast('Please enter a prompt or attach a document.', 'info');
        return;
      }

      // Store pending prompt and attachment
      sessionStorage.setItem('pendingPrompt', text);
      if (stagedAttachment) {
        sessionStorage.setItem('pendingAttachment', JSON.stringify(stagedAttachment));
      } else {
        sessionStorage.removeItem('pendingAttachment');
      }

      if (typeof window.startNewConversationId === 'function') {
        const titleSource = text || stagedAttachment?.filename || 'New Chat';
        window.startNewConversationId(titleSource);
      }

      window.location.href = '../02_active_conversation/code.html';
    }

    // Replace click listener on sendBtn
    sendBtn.onclick = (e) => {
      e.preventDefault();
      submitDashboard();
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitDashboard();
      }
    };
  }

  function setupActiveConversationPage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input || !sendBtn) return;

    // 1. Create attachment preview container
    let previewContainer = document.getElementById('attachment-preview-container');
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'attachment-preview-container';
      previewContainer.className = 'w-full mb-2 hidden';
      input.closest('.relative').before(previewContainer);
    }

    // 2. Hidden file input
    let fileInput = document.getElementById('chat-file-input');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'chat-file-input';
      fileInput.className = 'chat-hidden-file-input hidden';
      fileInput.accept = ALLOWED_EXTENSIONS.join(',');
      document.body.appendChild(fileInput);
    }

    // 3. Bind Buttons
    const composerButtons = Array.from(input.closest('.p-2.rounded-2xl').querySelectorAll('button'));

    const attachBtn = composerButtons.find(b => {
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      return text.trim() === 'attach_file';
    });
    const micBtn = composerButtons.find(b => {
      const text = b.querySelector('.material-symbols-outlined')?.textContent || '';
      return text.trim() === 'mic';
    });

    if (attachBtn) {
      attachBtn.id = 'chat-attach-btn';
      attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });
    }

    if (micBtn) {
      micBtn.id = 'chat-mic-btn';
      micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleVoiceDictation(micBtn, input);
      });
    }

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) uploadChatAttachment(file, previewContainer);
    });

    // 4. Overwrite submit handler
    function submitActiveChat() {
      if (isUploading) {
        showToast('Please wait for the attachment to finish uploading...', 'info');
        return;
      }

      const text = (input.value || '').trim();
      if (!text && !stagedAttachment) {
        showToast('Please type a question or attach a file.', 'info');
        return;
      }

      const currentAttachment = stagedAttachment;
      // Do NOT clear stagedAttachment here yet; wait for successful server response.
      // executeChatMessage will handle clearing upon success or preserving upon failure.
      if (typeof window.executeChatMessage === 'function') {
        window.executeChatMessage(text, currentAttachment);
      }
    }

    sendBtn.onclick = (e) => {
      e.preventDefault();
      submitActiveChat();
    };

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitActiveChat();
      }
    };

    // 5. Check for pending prompt and pending attachment from Screen 01
    const pendingPrompt = sessionStorage.getItem('pendingPrompt');
    const pendingAttachmentRaw = sessionStorage.getItem('pendingAttachment');

    if (pendingPrompt || pendingAttachmentRaw) {
      sessionStorage.removeItem('pendingPrompt');
      sessionStorage.removeItem('pendingAttachment');

      let parsedAttachment = null;
      try {
        if (pendingAttachmentRaw) parsedAttachment = JSON.parse(pendingAttachmentRaw);
      } catch (e) {}

      setTimeout(() => {
        if (typeof window.executeChatMessage === 'function') {
          window.executeChatMessage(pendingPrompt || '', parsedAttachment);
        }
      }, 350);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Public Exports & DOM Ready Hook
  // ---------------------------------------------------------------------------
  window.SmartAssistComposer = {
    getStagedAttachment: () => stagedAttachment,
    setStagedAttachment: (att) => {
      stagedAttachment = att;
      const c = document.getElementById('attachment-preview-container');
      if (c && att) {
        renderAttachmentPreview(c, att, 'ready');
      } else if (c) {
        renderAttachmentPreview(c, null);
      }
    },
    clearStagedAttachment: () => {
      stagedAttachment = null;
      const c = document.getElementById('attachment-preview-container');
      if (c) renderAttachmentPreview(c, null);
      const inputs = document.querySelectorAll('.chat-hidden-file-input');
      inputs.forEach(i => { i.value = ''; });
    },
    formatBytes,
    getFileIcon,
    showToast
  };

  document.addEventListener('DOMContentLoaded', () => {
    const isDashboard = window.location.pathname.includes('01_main_chat_dashboard');
    const isChatPage = window.location.pathname.includes('02_active_conversation');

    if (isDashboard) {
      setupDashboardPage();
    } else if (isChatPage) {
      setupActiveConversationPage();
    }
  });
})();

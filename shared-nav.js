/**
 * SmartAssist AI - Unified Client Navigation
 * Connects sidebar links, auth flows, and cross-screen routing.
 */
document.addEventListener('DOMContentLoaded', () => {
  const routes = {
    'chat': '../01_main_chat_dashboard/code.html',
    'study-assistant': '../03_study_assistant/code.html',
    'code-assistant': '../04_code_assistant/code.html',
    'chat-with-pdf': '../05_chat_with_pdf/code.html',
    'settings': '../06_settings/code.html',
    'sign-in': '../09_sign_in/code.html',
    'create-account': '../08_sign_up/code.html',
    'reset-password': '../10_forgot_password/code.html',
    'welcome': '../07_welcome/code.html'
  };

  // 1. Connect all [data-path] elements
  document.querySelectorAll('[data-path]').forEach(el => {
    const key = el.getAttribute('data-path');
    const target = routes[key];
    if (target) {
      if (el.tagName === 'A') {
        el.href = target;
      } else {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = target;
        });
      }
    }
  });

  // 2. "New Chat" and "Recent Chats" are dynamically managed by sidebar.js

  // 4. Connect SmartAssist AI Logo to Dashboard
  document.querySelectorAll('img[alt="SmartAssist AI Logo"]').forEach(img => {
    const brandContainer = img.closest('.flex');
    if (brandContainer) {
      brandContainer.style.cursor = 'pointer';
      brandContainer.addEventListener('click', () => {
        window.location.href = '../01_main_chat_dashboard/code.html';
      });
    }
  });

  // 5. Connect User Profile Navigation (Top-right avatar/icon and profile images)
  async function checkUserSession() {
    // 1. Fast synchronous check for cached tokens / session
    const storedUser = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        if (u && (u.id || u.email) && u.id !== 'guest_user') return u;
      } catch (e) {}
    }
    const storedSession = localStorage.getItem('smartassist_session') || sessionStorage.getItem('smartassist_session');
    if (storedSession) {
      try {
        const s = JSON.parse(storedSession);
        if (s && s.accessToken) return s.user || { id: 'authenticated_user' };
      } catch (e) {}
    }
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const val = localStorage.getItem(k);
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (parsed && (parsed.access_token || parsed.user)) {
              return parsed.user || { id: 'authenticated_user' };
            }
          } catch (e) {}
        }
      }
    }
    // 2. If not found in storage, check window.SmartAssistAuth with timeout
    if (window.SmartAssistAuth) {
      try {
        const userPromise = window.SmartAssistAuth.getUser();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1200));
        const user = await Promise.race([userPromise, timeoutPromise]);
        if (user && user.id && user.id !== 'guest_user') return user;
      } catch (e) {}
    }
    return null;
  }

  async function handleProfileNavigation(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const user = await checkUserSession();
    if (user) {
      window.location.href = '../06_settings/code.html';
    } else {
      window.location.href = '../09_sign_in/code.html';
    }
  }

  const profileElements = new Set();

  const idBtn = document.getElementById('navProfileIconBtn');
  if (idBtn) profileElements.add(idBtn);

  document.querySelectorAll('header .material-symbols-outlined').forEach(icon => {
    if (icon.textContent.trim() === 'person') {
      const parent = icon.closest('a') || icon.closest('.w-8.h-8') || icon.parentElement;
      if (parent) profileElements.add(parent);
    }
  });

  document.querySelectorAll('img[alt*="Profile"]').forEach(img => {
    const parent = img.closest('.flex') || img;
    profileElements.add(parent);
  });

  profileElements.forEach(el => {
    el.style.cursor = 'pointer';
    // Remove any inline onclick or conflicting listeners if present
    el.addEventListener('click', handleProfileNavigation);
  });

  // Pre-update title & href based on session status
  checkUserSession().then(user => {
    profileElements.forEach(el => {
      if (user) {
        el.title = 'Account Settings (Signed In)';
        if (el.tagName === 'A') el.href = '../06_settings/code.html';
      } else {
        el.title = 'Sign In to Account';
        if (el.tagName === 'A') el.href = '../09_sign_in/code.html';
      }
    });
  });

  // 6. Connect Welcome Portal Auth CTA buttons (Screen 07)
  const isWelcomePage = window.location.pathname.includes('07_welcome');
  if (isWelcomePage) {
    document.querySelectorAll('button').forEach(btn => {
      const text = btn.textContent.trim();
      if (text.includes('Create Account') || text.includes('Continue with Google')) {
        btn.addEventListener('click', () => {
          window.location.href = '../08_sign_up/code.html';
        });
      } else if (text === 'Sign In') {
        btn.addEventListener('click', () => {
          window.location.href = '../09_sign_in/code.html';
        });
      }
    });

    // Feature pillar click navigation on welcome page
    const bentoCards = document.querySelectorAll('.group');
    bentoCards.forEach(card => {
      const t = card.textContent;
      if (t.includes('Study Copilot')) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.location.href = '../03_study_assistant/code.html');
      } else if (t.includes('Code Debugger')) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.location.href = '../04_code_assistant/code.html');
      } else if (t.includes('PDF Intelligence')) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.location.href = '../05_chat_with_pdf/code.html');
      } else if (t.includes('Fast General Chat')) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => window.location.href = '../01_main_chat_dashboard/code.html');
      }
    });
  }

  // 7. Connect Auth Forms (Screens 08, 09, 10)
  const isSignUp = window.location.pathname.includes('08_sign_up');
  if (isSignUp) {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.includes('Create Academic Account') || btn.textContent.includes('Get Started')) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = '../01_main_chat_dashboard/code.html';
        });
      }
    });
    // "Already have an account? Sign in" link
    document.querySelectorAll('a').forEach(a => {
      if (a.textContent.includes('Sign in') || a.textContent.includes('Sign In')) {
        a.href = '../09_sign_in/code.html';
      }
    });
  }

  const isSignIn = window.location.pathname.includes('09_sign_in');
  if (isSignIn) {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent.includes('Sign In to Workspace') || btn.textContent.trim() === 'Sign In') {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          window.location.href = '../01_main_chat_dashboard/code.html';
        });
      }
    });
    document.querySelectorAll('a').forEach(a => {
      if (a.textContent.includes('Forgot password?')) {
        a.href = '../10_forgot_password/code.html';
      } else if (a.textContent.includes('Register') || a.textContent.includes('create an account')) {
        a.href = '../08_sign_up/code.html';
      }
    });
  }

  const isForgotPass = window.location.pathname.includes('10_forgot_password');
  if (isForgotPass) {
    document.querySelectorAll('a').forEach(a => {
      if (a.textContent.includes('Back to Sign In')) {
        a.href = '../09_sign_in/code.html';
      }
    });
  }
});

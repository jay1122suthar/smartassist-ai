/**
 * SmartAssist AI — Unified Supabase Client & Authentication Layer
 * Provides secure session management, real profile persistence via
 * Supabase Auth user_metadata + public.profiles table, and dynamic UI syncing.
 */

(function (window) {
  'use strict';

  let _client = null;
  let _configPromise = null;

  async function fetchConfig() {
    if (_configPromise) return _configPromise;
    _configPromise = (async () => {
      try {
        const res = await fetch('/api/auth/config');
        if (!res.ok) throw new Error('Failed to load auth config');
        return await res.json();
      } catch (err) {
        console.warn('[SmartAssistAuth] Could not fetch /api/auth/config:', err.message);
        return null;
      }
    })();
    return _configPromise;
  }

  async function init() {
    if (_client) return _client;

    // Ensure Supabase JS library is loaded
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('[SmartAssistAuth] Supabase library not detected on window.');
      return null;
    }

    const config = await fetchConfig();
    if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
      console.warn('[SmartAssistAuth] Supabase is not properly configured.');
      return null;
    }

    try {
      _client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });

      // Synchronize session if access token exists in storage but client session is empty
      const { data: sessionData } = await _client.auth.getSession();
      if (!sessionData?.session) {
        const storedSession = localStorage.getItem('smartassist_session') || sessionStorage.getItem('smartassist_session');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            if (parsed.accessToken && parsed.refreshToken) {
              await _client.auth.setSession({
                access_token: parsed.accessToken,
                refresh_token: parsed.refreshToken
              });
            }
          } catch (e) {
            // Ignore parse error
          }
        }
      }

      return _client;
    } catch (err) {
      console.error('[SmartAssistAuth] Initialization error:', err);
      return null;
    }
  }

  async function getClient() {
    if (_client) return _client;
    return await init();
  }

  async function getUser() {
    const client = await getClient();
    if (!client) {
      // Check cached user in localStorage/sessionStorage
      const cached = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
      return cached ? JSON.parse(cached) : null;
    }

    try {
      const { data: { user }, error } = await client.auth.getUser();
      if (user && !error) return user;

      // Fallback check session
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session?.user) {
        return sessionData.session.user;
      }
      return null;
    } catch (err) {
      console.warn('[SmartAssistAuth] getUser error:', err.message);
      return null;
    }
  }

  function getInitials(name, email) {
    if (name && typeof name === 'string' && name.trim()) {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email && typeof email === 'string' && email.includes('@')) {
      const local = email.split('@')[0];
      return local.slice(0, 2).toUpperCase();
    }
    return 'U';
  }

  async function getProfile() {
    const user = await getUser();
    if (!user) return null;

    const email = user.email || '';
    let fullName = user.user_metadata?.full_name || '';
    let avatarUrl = user.user_metadata?.avatar_url || '';

    // If full_name or avatarUrl is empty, check cached user
    try {
      const cached = JSON.parse(localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user') || '{}');
      if (!fullName && cached.name) fullName = cached.name;
      if (!avatarUrl && cached.avatarUrl) avatarUrl = cached.avatarUrl;
    } catch (e) {}

    if (!fullName && email) {
      fullName = email.split('@')[0];
    }

    // Try reading from public.profiles table if it exists
    const client = await getClient();
    if (client && user.id) {
      try {
        const { data: profileRow, error } = await client
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profileRow && !error) {
          if (profileRow.full_name) fullName = profileRow.full_name;
          if (profileRow.avatar_url) avatarUrl = profileRow.avatar_url;
        }
      } catch (e) {
        // Table may not exist yet in user's Supabase project, user_metadata is the primary resilient store
      }
    }

    const initials = getInitials(fullName, email);
    const settings = user.user_metadata?.settings || {};

    return {
      id: user.id,
      email: email,
      fullName: fullName || 'User',
      avatarUrl: avatarUrl,
      initials: initials,
      settings: settings,
      emailConfirmed: Boolean(user.email_confirmed_at),
      createdAt: user.created_at
    };
  }

  async function updateProfile({ fullName, avatarUrl, settings }) {
    const client = await getClient();
    const user = await getUser();
    if (!user) throw new Error('No authenticated user session found.');

    const updates = {};
    if (fullName !== undefined) updates.full_name = fullName.trim();
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
    if (settings !== undefined) updates.settings = settings;

    // 1. Update Supabase Auth user_metadata (guaranteed to succeed and persist)
    if (client) {
      const { data, error } = await client.auth.updateUser({
        data: updates
      });
      if (error) throw error;
    }

    // 2. Attempt to upsert into public.profiles table (if table and RLS exist)
    if (client && user.id) {
      try {
        const profilePayload = {
          id: user.id,
          full_name: updates.full_name !== undefined ? updates.full_name : (user.user_metadata?.full_name || ''),
          email: user.email,
          avatar_url: updates.avatar_url !== undefined ? updates.avatar_url : (user.user_metadata?.avatar_url || ''),
          updated_at: new Date().toISOString()
        };
        if (updates.settings !== undefined) {
          profilePayload.settings = updates.settings;
        }
        await client.from('profiles').upsert(profilePayload);
      } catch (tblErr) {
        console.warn('[SmartAssistAuth] public.profiles upsert skipped or failed:', tblErr?.message);
      }
    }

    // 3. Update local caches
    const cachedUser = {
      id: user.id,
      email: user.email,
      name: updates.full_name !== undefined ? updates.full_name : (user.user_metadata?.full_name || user.email?.split('@')[0]),
      avatarUrl: updates.avatar_url !== undefined ? updates.avatar_url : (user.user_metadata?.avatar_url || '')
    };
    localStorage.setItem('smartassist_user', JSON.stringify(cachedUser));
    sessionStorage.setItem('smartassist_user', JSON.stringify(cachedUser));

    if (settings !== undefined) {
      localStorage.setItem('smartassist_settings', JSON.stringify(settings));
    }

    // 4. Synchronize UI avatars and names across page
    syncAllAvatarsAndNames({
      id: user.id,
      email: user.email,
      fullName: cachedUser.name,
      avatarUrl: cachedUser.avatarUrl,
      initials: getInitials(cachedUser.name, user.email)
    });

    return { ...cachedUser, settings: updates.settings || user.user_metadata?.settings || {} };
  }

  async function uploadAvatar(file) {
    if (!file) throw new Error('No image file was provided.');

    // Validate type
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'webp'];

    if (!validMimes.includes(file.type) && !validExts.includes(ext)) {
      throw new Error('Unsupported image format. Please select a JPEG, PNG, or WebP image.');
    }

    // Validate size (5 MB limit)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const mbSize = (file.size / (1024 * 1024)).toFixed(1);
      throw new Error(`Image exceeds the maximum allowed size of 5 MB (${mbSize} MB selected).`);
    }

    const user = await getUser();
    if (!user) throw new Error('Please sign in before uploading a profile picture.');

    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    const client = await getClient();
    if (client) {
      try {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData?.session?.access_token) {
          headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
        }
      } catch (_) {}
    }
    headers['X-User-Id'] = user.id;

    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers,
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload profile photo.');
    }

    const avatarUrl = data.avatarUrl;

    // Save to user metadata and caches
    await updateProfile({ avatarUrl });

    const profile = await getProfile();
    window.dispatchEvent(new CustomEvent('smartassist:profile-updated', { detail: profile }));

    return {
      success: true,
      message: 'Profile photo uploaded successfully.',
      avatarUrl
    };
  }

  async function removeAvatar() {
    const user = await getUser();
    if (!user) throw new Error('Please sign in to modify your profile picture.');

    const headers = {};
    const client = await getClient();
    if (client) {
      try {
        const { data: sessionData } = await client.auth.getSession();
        if (sessionData?.session?.access_token) {
          headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
        }
      } catch (_) {}
    }
    headers['X-User-Id'] = user.id;

    const res = await fetch('/api/profile/avatar', {
      method: 'DELETE',
      headers
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove profile photo.');
    }

    // Reset avatarUrl to empty string
    await updateProfile({ avatarUrl: '' });

    const profile = await getProfile();
    window.dispatchEvent(new CustomEvent('smartassist:profile-updated', { detail: profile }));

    return {
      success: true,
      message: 'Profile photo removed successfully.'
    };
  }

  async function updateEmail(newEmail) {
    const client = await getClient();
    if (!client) throw new Error('Authentication client unavailable.');

    const trimmed = (newEmail || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      throw new Error('Please enter a valid email address.');
    }

    const { data, error } = await client.auth.updateUser({
      email: trimmed
    });

    if (error) throw error;

    return {
      success: true,
      message: `A confirmation link has been sent to ${trimmed}. Please check your inbox to confirm the change.`
    };
  }

  async function signOut() {
    try {
      const client = await getClient();
      if (client) {
        await client.auth.signOut().catch(() => {});
      }
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } catch (e) {
      console.warn('[SmartAssistAuth] signOut error:', e);
    } finally {
      localStorage.removeItem('smartassist_user');
      localStorage.removeItem('smartassist_session');
      sessionStorage.removeItem('smartassist_user');
      sessionStorage.removeItem('smartassist_token');
      sessionStorage.removeItem('smartassist_session');

      // Clear any Supabase local storage keys
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {}

      window.location.href = '../09_sign_in/code.html';
    }
  }

  function createInitialsAvatar(initials, sizeClasses = 'w-9 h-9 text-xs') {
    const div = document.createElement('div');
    div.className = `${sizeClasses} rounded-full bg-primary text-white font-semibold flex items-center justify-center shrink-0 tracking-wider shadow-sm select-none`;
    div.textContent = initials || 'U';
    return div;
  }

  function syncAllAvatarsAndNames(profile) {
    if (!profile) return;

    const fullName = profile.fullName || profile.name || 'User';
    const email = profile.email || '';
    const avatarUrl = profile.avatarUrl || '';
    const initials = profile.initials || getInitials(fullName, email);

    // 1. Sidebar bottom profile
    const sidebarProfileSection = document.getElementById('sidebar-profile-section') ||
      document.querySelector('aside .flex.items-center.gap-space-sm.pt-space-xs') ||
      document.querySelector('aside .p-space-md.bg-surface-container\\/50 .flex.items-center.gap-space-sm');

    if (sidebarProfileSection) {
      const nameEl = sidebarProfileSection.querySelector('.font-label-md');
      if (nameEl) nameEl.textContent = fullName;

      const subEl = sidebarProfileSection.querySelector('.font-body-sm');
      if (subEl) subEl.textContent = email || 'Verified Account';

      // Remove fictional "CSE" badge if present
      const badge = sidebarProfileSection.querySelector('.bg-tertiary-fixed');
      if (badge) badge.remove();

      // Find existing avatar element (whether img, initials div, or badge)
      const currentAvatar = sidebarProfileSection.querySelector('img, [data-profile-avatar="true"], #sidebarUserAvatarBadge');
      if (currentAvatar) {
        if (avatarUrl) {
          if (currentAvatar.tagName === 'IMG') {
            currentAvatar.src = avatarUrl;
            currentAvatar.alt = fullName;
            currentAvatar.className = 'w-9 h-9 rounded-full object-cover ring-2 ring-surface-container-highest shrink-0';
            currentAvatar.setAttribute('data-profile-avatar', 'true');
          } else {
            const newImg = document.createElement('img');
            newImg.src = avatarUrl;
            newImg.alt = fullName;
            newImg.className = 'w-9 h-9 rounded-full object-cover ring-2 ring-surface-container-highest shrink-0';
            newImg.setAttribute('data-profile-avatar', 'true');
            currentAvatar.replaceWith(newImg);
          }
        } else {
          const initialsDiv = createInitialsAvatar(initials, 'w-9 h-9 text-xs ring-2 ring-surface-container-highest shrink-0');
          initialsDiv.setAttribute('data-profile-avatar', 'true');
          currentAvatar.replaceWith(initialsDiv);
        }
      }
    }

    // 2. Header avatar (top-right of screen)
    const headerAvatar = document.querySelector('header [data-header-avatar="true"], header #headerUserAvatarBadge, header img[alt="Profile"], header img.rounded-full');
    if (headerAvatar) {
      if (avatarUrl) {
        if (headerAvatar.tagName === 'IMG') {
          headerAvatar.src = avatarUrl;
          headerAvatar.alt = fullName;
          headerAvatar.className = 'w-8 h-8 rounded-full object-cover ring-1 ring-outline-variant shrink-0 cursor-pointer';
          headerAvatar.setAttribute('data-header-avatar', 'true');
        } else {
          const newImg = document.createElement('img');
          newImg.src = avatarUrl;
          newImg.alt = fullName;
          newImg.className = 'w-8 h-8 rounded-full object-cover ring-1 ring-outline-variant shrink-0 cursor-pointer';
          newImg.setAttribute('data-header-avatar', 'true');
          headerAvatar.replaceWith(newImg);
        }
      } else {
        const initialsDiv = createInitialsAvatar(initials, 'w-8 h-8 text-xs ring-1 ring-outline-variant shrink-0 cursor-pointer');
        initialsDiv.setAttribute('data-header-avatar', 'true');
        headerAvatar.replaceWith(initialsDiv);
      }
    }

    // 3. Sidebar Popover DOM (if created by sidebar.js)
    const popoverName = document.querySelector('#sidebar-profile-popover .font-label-md');
    if (popoverName) popoverName.textContent = fullName;
    const popoverEmail = document.querySelector('#sidebar-profile-popover .font-code-sm');
    if (popoverEmail) popoverEmail.textContent = email;
    const popoverBadge = document.querySelector('#sidebar-profile-popover .bg-tertiary-fixed');
    if (popoverBadge) {
      popoverBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span><span>Verified User</span>';
    }

    // 4. Modal Profile DOM (if created by sidebar.js)
    const modalName = document.querySelector('#smartassist-profile-modal .font-title-md');
    if (modalName) modalName.textContent = fullName;
    const modalEmail = document.querySelector('#smartassist-profile-modal .font-code-sm');
    if (modalEmail) modalEmail.textContent = email;
    const modalAvatar = document.querySelector('#smartassist-profile-modal [data-modal-avatar="true"], #smartassist-profile-modal img, #smartassist-profile-modal .w-12.h-12');
    if (modalAvatar) {
      if (avatarUrl) {
        if (modalAvatar.tagName === 'IMG') {
          modalAvatar.src = avatarUrl;
          modalAvatar.alt = fullName;
          modalAvatar.className = 'w-12 h-12 rounded-full object-cover ring-2 ring-primary-container/30 shrink-0';
          modalAvatar.setAttribute('data-modal-avatar', 'true');
        } else {
          const modalImg = document.createElement('img');
          modalImg.src = avatarUrl;
          modalImg.alt = fullName;
          modalImg.className = 'w-12 h-12 rounded-full object-cover ring-2 ring-primary-container/30 shrink-0';
          modalImg.setAttribute('data-modal-avatar', 'true');
          modalAvatar.replaceWith(modalImg);
        }
      } else {
        const modalInitials = createInitialsAvatar(initials, 'w-12 h-12 text-base ring-2 ring-primary-container/30 shrink-0');
        modalInitials.setAttribute('data-modal-avatar', 'true');
        modalAvatar.replaceWith(modalInitials);
      }
    }

    // 5. Settings Page Avatar DOM (if on 06_settings/code.html)
    const settingsImg = document.getElementById('profileAvatarImg');
    const settingsInitials = document.getElementById('profileAvatarInitials');
    if (settingsImg && settingsInitials) {
      if (avatarUrl) {
        settingsImg.src = avatarUrl;
        settingsImg.classList.remove('hidden');
        settingsInitials.classList.add('hidden');
      } else {
        settingsImg.src = '';
        settingsImg.classList.add('hidden');
        settingsInitials.textContent = initials;
        settingsInitials.classList.remove('hidden');
      }
    }
  }

  // Synchronous cache sync to eliminate UI flicker on page load
  try {
    const raw = localStorage.getItem('smartassist_user') || sessionStorage.getItem('smartassist_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u) {
        syncAllAvatarsAndNames({
          fullName: u.name || '',
          email: u.email || '',
          avatarUrl: u.avatarUrl || '',
          initials: getInitials(u.name, u.email)
        });
      }
    }
  } catch (_) {}

  // Asynchronous full profile sync on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    getProfile().then(p => {
      if (p) syncAllAvatarsAndNames(p);
    }).catch(() => {});
  });

  // Cross-tab and live reactive updates
  window.addEventListener('smartassist:profile-updated', (e) => {
    if (e.detail) syncAllAvatarsAndNames(e.detail);
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'smartassist_user' && e.newValue) {
      try {
        const u = JSON.parse(e.newValue);
        if (u) {
          syncAllAvatarsAndNames({
            fullName: u.name || '',
            email: u.email || '',
            avatarUrl: u.avatarUrl || '',
            initials: getInitials(u.name, u.email)
          });
        }
      } catch (_) {}
    }
  });

  // Export to window
  window.SmartAssistAuth = {
    init,
    getClient,
    getUser,
    getProfile,
    updateProfile,
    uploadAvatar,
    removeAvatar,
    updateEmail,
    signOut,
    getInitials,
    createInitialsAvatar,
    syncAllAvatarsAndNames
  };

})(window);

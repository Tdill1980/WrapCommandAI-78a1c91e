(async function() {
  'use strict';

  // ============================================================
  // WrapCommandAI Chat Widget v4 — Points to YOUR Supabase
  // Updated: February 5, 2026
  // Supabase: qxllysilzonrlyoaomce.supabase.co
  // ============================================================
  // CHANGELOG v3:
  //   • Session uses sessionStorage (persists across pages in same tab, fresh on new tab)
  //   • Response field: checks data.reply || data.response || data.message (bulletproof)
  //   • Branding: "Powered by WrapCommandAI"
  //   • Header: "WPW Support Team"
  //   • Gradient dark theme with magenta → purple
  //   • Smart onboarding: skips if user is logged in (WooCommerce / WPW account)
  //   • Proper fallbacks on every error path
  //   • Full knowledge base context sent with every message
  // ============================================================

  // Kill switch
  if (window.WRAPCOMMAND_DISABLED) {
    console.log('[WCAI] Widget disabled via kill switch');
    return;
  }

  // Configuration from script attributes
  const scriptTag = document.currentScript;
  const config = {
    org: scriptTag?.getAttribute('data-org') || 'wpw',
    agent: scriptTag?.getAttribute('data-agent') || 'wpw_support',
    mode: scriptTag?.getAttribute('data-mode') || 'live',
    theme: scriptTag?.getAttribute('data-theme') || 'dark-pro',
    // Edge functions on YOUR Supabase (qxllysilzonrlyoaomce)
    // command-chat = the real AI agent (WPW Team). website-chat was the old SMS-relay (deprecated).
    apiUrl: 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/command-chat',
    statusUrl: 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/check-agent-status',
    artworkCheckUrl: 'https://qxllysilzonrlyoaomce.supabase.co/functions/v1/check-artwork-file',
    // YOUR Supabase anon key
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4bGx5c2lsem9ucmx5b2FvbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzQxMjIsImV4cCI6MjA4MzgxMDEyMn0.s1IyOY7QAVyrTtG_XLhugJUvxi2X_nHCvqvchYCvwtM',
    // Storage on YOUR Supabase
    supabaseUrl: 'https://qxllysilzonrlyoaomce.supabase.co'
  };

  // ========================================
  // THEME — Dark Pro with Magenta/Purple Gradient
  // ========================================
  const colors = {
    primary: '#e6007e',
    secondary: '#7c3aed',
    tertiary: '#3b82f6',
    text: '#ffffff',
    accent: '#22c55e',
    bgDark: '#1a1a2e',
    bgCard: '#16213e',
    bgInput: '#0f3460',
    gradient: 'linear-gradient(135deg, #e6007e 0%, #7c3aed 100%)',
    gradientWide: 'linear-gradient(135deg, #e6007e 0%, #7c3aed 50%, #3b82f6 100%)',
    border: 'rgba(139,92,246,0.3)',
    borderGlow: 'rgba(230,0,126,0.3)',
    textMuted: '#94a3b8',
    textBody: '#e2e8f0',
    textDim: '#64748b'
  };

  console.log('[WCAI] Widget v3 loaded | Theme: dark-pro');

  // ========================================
  // ALWAYS ON — 24/7, no schedule check
  // ========================================

  // WPW Logo
  const WPW_LOGO = 'https://weprintwraps.com/cdn/shop/files/WePrintWraps-Logo-White.png?v=1690318107';

  // QUICK ACTIONS — 4 buttons
  const quickActions = [
    { id: 'quote', text: 'How much is my wrap project?', icon: '🚗', primary: true, message: 'How much is my wrap project?' },
    { id: 'order', text: 'Check my order status', icon: '📦', message: 'I need to check on my order status' },
    { id: 'restyle', text: 'Ask about RestyleProAI', icon: '🎨', message: 'Tell me about RestyleProAI and how it can help visualize my wrap' },
    { id: 'rep', text: 'Talk to a rep (rush job / issue)', icon: '🙋', message: 'I have a rush job or a real issue and would like a rep to contact me as soon as possible.' }
  ];

  // Geo data
  let geoData = null;

  // File upload rate limiting
  let fileUploadCount = 0;
  const MAX_UPLOADS_PER_SESSION = 3;

  // Fetch geo on load
  (async function fetchGeoData() {
    try {
      const response = await fetch('https://ipapi.co/json/', { cache: 'force-cache' });
      if (response.ok) {
        const data = await response.json();
        geoData = {
          ip: data.ip,
          city: data.city,
          region: data.region,
          country: data.country_code,
          country_name: data.country_name,
          timezone: data.timezone,
          latitude: data.latitude,
          longitude: data.longitude
        };
        console.log('[WCAI] Geo:', geoData?.city, geoData?.country);
      }
    } catch (err) {
      console.warn('[WCAI] Geo fetch failed');
    }
  })();

  // ========================================
  // SMART LOGIN DETECTION
  // ONLY skip onboarding if we have ACTUAL name + email
  // Session cookies alone are NOT enough
  // ========================================
  function detectLoggedInUser() {
    try {
      // Method 1: Check sessionStorage for previously collected info from THIS tab
      // This is the ONLY reliable source - user already provided their info
      const savedName = sessionStorage.getItem('wcai_user_name');
      const savedEmail = sessionStorage.getItem('wcai_user_email');
      if (savedName && savedEmail) {
        return { name: savedName, email: savedEmail };
      }

      // Method 2: Check for WordPress data attributes (rare but useful)
      const accountLink = document.querySelector('[data-user-name][data-user-email]');
      if (accountLink) {
        const userName = accountLink.getAttribute('data-user-name') || '';
        const userEmail = accountLink.getAttribute('data-user-email') || '';
        if (userName && userEmail) {
          return { name: userName, email: userEmail };
        }
      }

      // IMPORTANT: We NO LONGER skip onboarding just because of cookies
      // wp_woocommerce_session is set for ALL visitors, not just logged-in users
      // We NEED email for lead tracking, so always require onboarding

      return null;
    } catch (e) {
      console.warn('[WCAI] Login detection error:', e);
      return null;
    }
  }

  // ========================================
  // STYLES
  // ========================================
  const styles = `
    .wcai-chat-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .wcai-bubble-row {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }
    .wcai-ask-trigger {
      background: ${colors.secondary};
      border-radius: 24px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 500;
      color: ${colors.text};
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 12px rgba(124,58,237,0.3);
      border: 1px solid rgba(124,58,237,0.2);
      transition: all 0.2s;
      opacity: 0;
      animation: wcai-slide-in 0.4s ease-out 2s forwards;
    }
    .wcai-ask-trigger:hover {
      transform: scale(1.03);
      box-shadow: 0 4px 16px rgba(124,58,237,0.4);
      border-color: ${colors.secondary};
    }
    .wcai-ask-trigger svg {
      width: 16px;
      height: 16px;
      color: ${colors.text};
    }
    .wcai-ask-trigger.hidden {
      display: none;
    }
    @keyframes wcai-slide-in {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .wcai-chat-bubble {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${colors.gradient};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px ${colors.borderGlow};
      transition: transform 0.2s, box-shadow 0.2s;
      position: relative;
    }
    .wcai-chat-bubble:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 25px rgba(230,0,126,0.5);
    }
    .wcai-chat-bubble img {
      width: 36px;
      height: auto;
      object-fit: contain;
    }
    .wcai-bubble-pulse {
      position: absolute;
      top: 0;
      right: 0;
      width: 14px;
      height: 14px;
      background: ${colors.accent};
      border-radius: 50%;
      border: 2px solid white;
      animation: wcai-pulse 2s infinite;
    }
    @keyframes wcai-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.8; }
    }
    .wcai-chat-window {
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 380px;
      max-height: 600px;
      background: ${colors.bgDark};
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid ${colors.borderGlow};
    }
    .wcai-chat-window.open {
      display: flex;
      animation: wcai-slide-up 0.3s ease-out;
    }
    @keyframes wcai-slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .wcai-chat-header {
      background: ${colors.gradient};
      padding: 16px 20px;
      color: ${colors.text};
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .wcai-chat-header-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      color: ${colors.text};
      border: 2px solid rgba(255,255,255,0.3);
    }
    .wcai-chat-header-info h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }
    .wcai-chat-header-info p {
      margin: 4px 0 0;
      font-size: 12px;
      opacity: 0.9;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wcai-live-dot {
      width: 8px;
      height: 8px;
      background: ${colors.accent};
      border-radius: 50%;
      animation: wcai-blink 1.5s infinite;
    }
    @keyframes wcai-blink {
      0%, 50%, 100% { opacity: 1; }
      25%, 75% { opacity: 0.4; }
    }
    .wcai-chat-close {
      margin-left: auto;
      background: rgba(255,255,255,0.1);
      border: none;
      color: ${colors.text};
      cursor: pointer;
      font-size: 20px;
      padding: 0;
      line-height: 1;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .wcai-chat-close:hover {
      background: rgba(255,255,255,0.2);
    }
    .wcai-chat-reset {
      background: rgba(255,255,255,0.1);
      border: none;
      color: ${colors.text};
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      padding: 8px 10px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
      white-space: nowrap;
    }
    .wcai-chat-reset:hover {
      background: rgba(255,255,255,0.2);
    }
    .wcai-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      padding-bottom: 28px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: ${colors.bgCard};
      min-height: 100px;
      max-height: 340px;
      scroll-padding-bottom: 28px;
    }
    .wcai-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      flex-shrink: 0;
    }
    .wcai-message.user {
      align-self: flex-end;
      background: ${colors.gradient};
      color: ${colors.text};
      border-bottom-right-radius: 4px;
    }
    .wcai-message.agent {
      align-self: flex-start;
      background: ${colors.bgInput};
      color: ${colors.textBody};
      border: 1px solid ${colors.border};
      border-bottom-left-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .wcai-message.typing {
      background: ${colors.bgInput};
    }
    .wcai-typing-dots {
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }
    .wcai-typing-dots span {
      width: 8px;
      height: 8px;
      background: ${colors.primary};
      border-radius: 50%;
      animation: wcai-bounce 1.4s infinite ease-in-out;
    }
    .wcai-typing-dots span:nth-child(1) { animation-delay: 0s; }
    .wcai-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .wcai-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes wcai-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
      40% { transform: scale(1); opacity: 1; }
    }
    .wcai-quick-actions {
      padding: 12px 16px;
      background: ${colors.bgDark};
      border-top: 1px solid ${colors.border};
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .wcai-quick-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid ${colors.border};
      background: ${colors.bgInput};
      cursor: pointer;
      font-size: 14px;
      color: ${colors.textBody};
      transition: all 0.2s;
      text-align: left;
      width: 100%;
    }
    .wcai-quick-btn:hover {
      border-color: ${colors.primary};
      background: rgba(230,0,126,0.1);
    }
    .wcai-quick-btn.primary {
      background: ${colors.gradient};
      border: none;
      color: white;
      font-weight: 600;
    }
    .wcai-quick-btn.primary:hover {
      background: linear-gradient(135deg, #c5006b, ${colors.primary});
    }
    .wcai-quick-btn-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .wcai-chat-input-area {
      padding: 12px 16px;
      border-top: 1px solid ${colors.border};
      background: ${colors.bgDark};
      display: flex;
      gap: 10px;
    }
    .wcai-chat-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid ${colors.border};
      border-radius: 24px;
      background: ${colors.bgInput};
      color: ${colors.textBody};
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .wcai-chat-input::placeholder {
      color: ${colors.textDim};
    }
    .wcai-chat-input:focus {
      border-color: ${colors.primary};
      background: ${colors.bgCard};
    }
    .wcai-chat-send {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: ${colors.gradient};
      color: ${colors.text};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .wcai-chat-send:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 16px rgba(230,0,126,0.5);
    }
    .wcai-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .wcai-chat-attach {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid ${colors.border};
      background: ${colors.bgInput};
      color: ${colors.textMuted};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .wcai-chat-attach:hover {
      border-color: ${colors.primary};
      color: ${colors.primary};
      background: ${colors.bgCard};
    }
    .wcai-powered {
      padding: 8px 16px;
      text-align: center;
      font-size: 11px;
      color: ${colors.textDim};
      background: ${colors.bgDark};
      border-top: 1px solid rgba(139,92,246,0.1);
    }
    .wcai-powered a {
      color: ${colors.primary};
      text-decoration: none;
    }
    .wcai-test-badge {
      position: absolute;
      top: -8px;
      left: -8px;
      background: #ef4444;
      color: white;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .wcai-typewriter {
      overflow: visible;
      border-right: 2px solid ${colors.primary};
      animation: wcai-cursor 0.7s step-end infinite;
    }
    .wcai-typewriter.done {
      border-right: none;
    }
    @keyframes wcai-cursor {
      0%, 100% { border-color: ${colors.primary}; }
      50% { border-color: transparent; }
    }

    /* Modal — dark gradient theme */
    .wcai-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.8);
      z-index: 9999999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: wcai-fade-in 0.2s ease-out;
    }
    @keyframes wcai-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .wcai-modal {
      background: ${colors.bgDark};
      border-radius: 16px;
      padding: 24px;
      max-width: 360px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      border: 1px solid ${colors.border};
      animation: wcai-modal-in 0.3s ease-out;
    }
    @keyframes wcai-modal-in {
      from { opacity: 0; transform: scale(0.9) translateY(20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .wcai-modal h3 {
      margin: 0 0 12px;
      font-size: 18px;
      color: ${colors.textBody};
    }
    .wcai-modal p {
      margin: 0 0 20px;
      color: ${colors.textMuted};
      font-size: 14px;
      line-height: 1.5;
    }
    .wcai-modal ul {
      margin: 0 0 16px;
      padding-left: 20px;
      color: ${colors.textMuted};
      font-size: 14px;
      line-height: 1.6;
    }
    .wcai-modal-buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .wcai-modal-btn {
      padding: 14px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .wcai-modal-btn.confirm {
      background: ${colors.gradient};
      color: white;
    }
    .wcai-modal-btn.confirm:hover {
      box-shadow: 0 4px 16px rgba(230,0,126,0.4);
    }
    .wcai-modal-btn.cancel {
      background: ${colors.bgInput};
      color: ${colors.textBody};
      border: 1px solid ${colors.border};
    }
    .wcai-modal-btn.cancel:hover {
      background: ${colors.bgCard};
    }

    /* Upload progress — dark theme */
    .wcai-upload-progress {
      background: ${colors.bgInput};
      border-radius: 8px;
      padding: 12px 16px;
      margin: 8px 0;
    }
    .wcai-upload-progress-bar {
      height: 6px;
      background: ${colors.bgCard};
      border-radius: 3px;
      overflow: hidden;
      margin-top: 8px;
    }
    .wcai-upload-progress-fill {
      height: 100%;
      background: ${colors.gradient};
      border-radius: 3px;
      transition: width 0.3s ease-out;
    }
    .wcai-upload-text {
      font-size: 13px;
      color: ${colors.textBody};
    }

    /* Onboarding screen — dark gradient */
    .wcai-onboarding {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 30px 20px;
      flex: 1;
      text-align: center;
      background: ${colors.bgCard};
    }
    .wcai-onboarding-text {
      font-size: 15px;
      color: ${colors.textBody};
      margin-bottom: 20px;
      line-height: 1.5;
    }
    .wcai-onboarding-input {
      width: 100%;
      max-width: 260px;
      padding: 12px 16px;
      margin-bottom: 12px;
      border: 1px solid ${colors.border};
      border-radius: 8px;
      background: ${colors.bgInput};
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    .wcai-onboarding-input:focus {
      border-color: ${colors.primary};
    }
    .wcai-onboarding-input::placeholder {
      color: ${colors.textDim};
    }
    .wcai-onboarding-start {
      width: 100%;
      max-width: 260px;
      padding: 12px 24px;
      margin-top: 8px;
      background: ${colors.gradient};
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .wcai-onboarding-start:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 16px rgba(230,0,126,0.4);
    }
    .wcai-onboarding-skip {
      background: none;
      border: none;
      color: ${colors.textDim};
      font-size: 13px;
      margin-top: 12px;
      cursor: pointer;
      text-decoration: underline;
      transition: color 0.2s;
    }
    .wcai-onboarding-skip:hover {
      color: ${colors.textMuted};
    }

    @media (max-width: 480px) {
      .wcai-chat-window {
        width: calc(100vw - 40px);
        max-height: calc(100vh - 120px);
        bottom: 70px;
        right: -10px;
      }
    }
  `;

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // ========================================
  // SESSION — sessionStorage (persists within tab, fresh on new tab)
  // ========================================
  function generateSessionId() {
    return 'wcai_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // Use sessionStorage: survives page nav in same tab, dies on tab close
  let sessionId = sessionStorage.getItem('wcai_session');
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem('wcai_session', sessionId);
  }

  // ========================================
  // DETECT LOGGED-IN USER (skip onboarding ONLY if we have email)
  // ========================================
  const detectedUser = detectLoggedInUser();
  // ONLY skip onboarding if we have BOTH name AND email
  const userIsLoggedIn = !!(detectedUser?.name && detectedUser?.email);

  // Quick actions HTML
  const quickActionsHTML = quickActions.map(action => {
    const btnClass = action.primary ? 'wcai-quick-btn primary' : 'wcai-quick-btn';
    return `<button class="${btnClass}" data-action="${action.id}">
      <span class="wcai-quick-btn-icon">${action.icon}</span>
      ${action.text}
    </button>`;
  }).join('');

  // ========================================
  // BUILD CHAT CONTAINER
  // Always show onboarding - we need email for lead tracking
  // ========================================
  const showOnboarding = true; // Always collect name/email

  const container = document.createElement('div');
  container.className = 'wcai-chat-container';
  container.innerHTML = `
    <div class="wcai-chat-window" id="wcai-window">
      <div class="wcai-chat-header">
        <div class="wcai-chat-header-avatar">W</div>
        <div class="wcai-chat-header-info">
          <h3>WPW Support Team</h3>
          <p><span class="wcai-live-dot"></span> Online</p>
        </div>
        <button class="wcai-chat-reset" id="wcai-reset" title="Start a new conversation">
          ↻ New chat
        </button>
        <button class="wcai-chat-close" id="wcai-close">&times;</button>
      </div>
      ${showOnboarding ? `
      <div class="wcai-onboarding" id="wcai-onboarding">
        <div class="wcai-onboarding-text">Enter your info to start chatting</div>
        <input type="text" class="wcai-onboarding-input" id="wcai-onboard-name" placeholder="Your Name" required />
        <input type="email" class="wcai-onboarding-input" id="wcai-onboard-email" placeholder="Your Email" required />
        <input type="tel" class="wcai-onboarding-input" id="wcai-onboard-phone" placeholder="Your Phone" required />
        <button class="wcai-onboarding-start" id="wcai-onboard-start">Start Chat</button>
        <div class="wcai-onboarding-note" style="font-size:11px;color:#94a3b8;margin-top:8px;text-align:center;">Required to receive your quote</div>
      </div>
      ` : ''}
      <div class="wcai-chat-messages" id="wcai-messages" style="${showOnboarding ? 'display:none;' : 'display:flex;'}">
        <div class="wcai-message agent" id="wcai-welcome"></div>
      </div>
      <div class="wcai-quick-actions" id="wcai-quick-actions" style="${showOnboarding ? 'display:none;' : 'display:flex;'}">
        ${quickActionsHTML}
      </div>
      <div class="wcai-chat-input-area" id="wcai-input-area" style="${showOnboarding ? 'display:none;' : 'display:flex;'}">
        <button class="wcai-chat-attach" id="wcai-attach" title="Attach file">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>
        <input type="text" class="wcai-chat-input" id="wcai-input" placeholder="Type a message..." />
        <button class="wcai-chat-send" id="wcai-send">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
      <div class="wcai-powered">
        Powered by <a href="https://wrapcommandai.com" target="_blank">WrapCommandAI</a>
      </div>
    </div>
    <div class="wcai-bubble-row">
      <div class="wcai-ask-trigger" id="wcai-ask-trigger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        Need Help? Ask Me Anything
      </div>
      <div class="wcai-chat-bubble" id="wcai-bubble">
        ${config.mode === 'test' ? '<span class="wcai-test-badge">TEST</span>' : ''}
        <img src="${WPW_LOGO}" alt="WPW" onerror="this.outerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'white\\' width=\\'28\\'><path d=\\'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z\\'/></svg>'"/>
        <span class="wcai-bubble-pulse"></span>
      </div>
    </div>
    <input type="file" id="wcai-file-input" style="display:none" accept=".pdf,.png,.jpg,.jpeg,.psd,.ai,.eps,.tif,.tiff" />
  `;
  document.body.appendChild(container);

  // ========================================
  // ELEMENT REFERENCES
  // ========================================
  const bubble = document.getElementById('wcai-bubble');
  const askTrigger = document.getElementById('wcai-ask-trigger');
  const chatWindow = document.getElementById('wcai-window');
  const closeBtn = document.getElementById('wcai-close');
  const resetBtn = document.getElementById('wcai-reset');
  const messagesContainer = document.getElementById('wcai-messages');
  const welcomeMessage = document.getElementById('wcai-welcome');
  const quickActionsContainer = document.getElementById('wcai-quick-actions');
  const input = document.getElementById('wcai-input');
  const sendBtn = document.getElementById('wcai-send');
  const attachBtn = document.getElementById('wcai-attach');
  const fileInput = document.getElementById('wcai-file-input');
  const inputArea = document.getElementById('wcai-input-area');

  // Onboarding elements (may not exist if user is logged in)
  const onboardingPanel = document.getElementById('wcai-onboarding');
  const onboardNameInput = document.getElementById('wcai-onboard-name');
  const onboardEmailInput = document.getElementById('wcai-onboard-email');
  const onboardPhoneInput = document.getElementById('wcai-onboard-phone');
  const onboardStartBtn = document.getElementById('wcai-onboard-start');
  const onboardSkipBtn = document.getElementById('wcai-onboard-skip');

  let isOpen = false;
  let hasInteracted = false;
  let hasOnboarded = userIsLoggedIn; // Skip onboarding if already logged in
  let collectedName = detectedUser?.name || '';
  let collectedEmail = detectedUser?.email || '';
  let collectedPhone = '';
  let collectedOrderNumber = '';
  let isCheckMyFileFlow = false;

  // ========================================
  // ATTACH BUTTON
  // ========================================
  if (attachBtn) {
    attachBtn.addEventListener('click', () => {
      if (fileUploadCount >= MAX_UPLOADS_PER_SESSION) {
        addMessage("You've reached the upload limit for this session. Please email your files to Design@WePrintWraps.com for review.", false);
        return;
      }
      isCheckMyFileFlow = false;
      fileInput.click();
    });
  }

  // ========================================
  // HELPER FUNCTIONS
  // ========================================
  function hideAskTrigger() {
    if (askTrigger && !askTrigger.classList.contains('hidden')) {
      askTrigger.classList.add('hidden');
    }
  }

  if (askTrigger) {
    askTrigger.addEventListener('click', () => toggleChat());
  }

  // Typewriter effect
  function typeMessage(element, text, speed = 30) {
    return new Promise((resolve) => {
      element.classList.add('wcai-typewriter');
      element.textContent = '';
      let i = 0;

      function type() {
        if (i < text.length) {
          element.textContent += text.charAt(i);
          i++;
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
          setTimeout(type, speed);
        } else {
          element.classList.remove('wcai-typewriter');
          element.classList.add('done');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
          resolve();
        }
      }

      setTimeout(type, 500);
    });
  }

  // Welcome message — personalized if we have a name
  function showWelcomeMessage() {
    const name = collectedName ? collectedName.split(' ')[0] : '';
    let welcomeText;
    if (name) {
      welcomeText = `Hey ${name}! Welcome to WePrintWraps. How can I help you today?`;
    } else {
      welcomeText = "Hey! Welcome to WePrintWraps. How can I help you today?";
    }
    typeMessage(welcomeMessage, welcomeText, 25);
  }

  // Complete onboarding (from form OR skip)
  async function completeOnboarding() {
    // Collect values from form if available
    if (onboardNameInput) {
      collectedName = onboardNameInput.value?.trim() || collectedName;
    }
    if (onboardEmailInput) {
      collectedEmail = onboardEmailInput.value?.trim() || collectedEmail;
    }
    if (onboardPhoneInput) {
      collectedPhone = onboardPhoneInput.value?.trim() || collectedPhone;
    }

    // Save to sessionStorage so we don't re-ask within this tab
    if (collectedName) sessionStorage.setItem('wcai_user_name', collectedName);
    if (collectedEmail) sessionStorage.setItem('wcai_user_email', collectedEmail);
    if (collectedPhone) sessionStorage.setItem('wcai_user_phone', collectedPhone);

    // Hide onboarding, show chat
    if (onboardingPanel) onboardingPanel.style.display = 'none';
    if (messagesContainer) messagesContainer.style.display = 'flex';
    if (inputArea) inputArea.style.display = 'flex';
    if (quickActionsContainer) quickActionsContainer.style.display = 'flex';

    hasOnboarded = true;
    hasInteracted = true;

    // Typing indicator
    showTyping();
    await new Promise(resolve => setTimeout(resolve, 1500));
    hideTyping();

    showWelcomeMessage();
    if (input) input.focus();
  }

  // Toggle chat
  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    if (isOpen) {
      hideAskTrigger();
      if (!hasOnboarded) {
        if (onboardNameInput) onboardNameInput.focus();
      } else {
        if (input) input.focus();
        if (!hasInteracted) {
          hasInteracted = true;
          showWelcomeMessage();
        }
      }
    }
  }

  // Reset conversation
  function resetConversation() {
    sessionId = generateSessionId();
    sessionStorage.setItem('wcai_session', sessionId);

    if (messagesContainer && welcomeMessage) {
      welcomeMessage.textContent = '';
      messagesContainer.replaceChildren(welcomeMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hasInteracted = true;
    showWelcomeMessage();

    if (quickActionsContainer) {
      quickActionsContainer.style.display = '';
    }
  }

  bubble.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  // Onboarding events - REQUIRE email before starting
  if (onboardStartBtn) {
    onboardStartBtn.addEventListener('click', () => {
      const email = onboardEmailInput?.value?.trim() || '';
      const name = onboardNameInput?.value?.trim() || '';
      const phone = onboardPhoneInput?.value?.trim() || '';

      // Validate name (at least 2 chars)
      if (!name || name.length < 2) {
        onboardNameInput.style.borderColor = '#ef4444';
        onboardNameInput.placeholder = 'Name required';
        onboardNameInput.focus();
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        onboardEmailInput.style.borderColor = '#ef4444';
        onboardEmailInput.placeholder = 'Valid email required';
        onboardEmailInput.focus();
        return;
      }

      // Validate phone (at least 10 digits)
      const phoneDigits = phone.replace(/\D/g, '');
      if (!phone || phoneDigits.length < 10) {
        onboardPhoneInput.style.borderColor = '#ef4444';
        onboardPhoneInput.placeholder = 'Phone required';
        onboardPhoneInput.focus();
        return;
      }

      completeOnboarding();
    });
  }
  // Skip button removed - email is required for lead tracking
  if (onboardNameInput) {
    onboardNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (onboardEmailInput) onboardEmailInput.focus();
      }
    });
  }
  if (onboardEmailInput) {
    onboardEmailInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        completeOnboarding();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetConversation();
    });
  }

  // ========================================
  // ADD MESSAGE TO UI
  // ========================================
  function addMessage(text, isUser, useTypewriter = false) {
    const msg = document.createElement('div');
    msg.className = `wcai-message ${isUser ? 'user' : 'agent'}`;

    if (useTypewriter && !isUser) {
      messagesContainer.appendChild(msg);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return typeMessage(msg, text, 20);
    } else {
      msg.textContent = text;
      messagesContainer.appendChild(msg);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return Promise.resolve();
    }
  }

  // Typing indicator
  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'wcai-message agent typing';
    typing.id = 'wcai-typing';
    typing.innerHTML = '<div class="wcai-typing-dots"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(typing);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById('wcai-typing');
    if (typing) typing.remove();
  }

  function hideQuickActions() {
    if (quickActionsContainer) {
      quickActionsContainer.style.display = 'none';
    }
  }

  // ========================================
  // CHECK MY FILE MODAL
  // ========================================
  function showCheckFileModal() {
    if (fileUploadCount >= MAX_UPLOADS_PER_SESSION) {
      addMessage("You've reached the upload limit for this session. Please email your files to Design@WePrintWraps.com for review.", false);
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'wcai-modal-overlay';
    overlay.id = 'wcai-modal-overlay';
    overlay.innerHTML = `
      <div class="wcai-modal">
        <h3>📎 Check My File</h3>
        <p>This file check is for <strong>full vehicle wraps over 200 sq ft</strong>. Our design team will review your file and email you with:</p>
        <ul>
          <li>Whether it's print-ready</li>
          <li>A quote for your wrap project</li>
          <li>Design services if needed</li>
        </ul>
        <p style="font-size:13px;color:${colors.textDim};margin-bottom:16px;">
          For sq ft pricing, use <a href="https://weprintwraps.com/quote" target="_blank" style="color:${colors.primary};">our quote tool</a> — select your make & model!
        </p>
        <div class="wcai-modal-buttons">
          <button class="wcai-modal-btn confirm" id="wcai-modal-yes">Yes, this is a full wrap over 200 sq ft</button>
          <button class="wcai-modal-btn cancel" id="wcai-modal-no">No / Not sure</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.getElementById('wcai-modal-yes').addEventListener('click', () => {
      overlay.remove();
      isCheckMyFileFlow = true;
      fileInput.click();
    });

    document.getElementById('wcai-modal-no').addEventListener('click', () => {
      overlay.remove();
      hideQuickActions();
      addMessage("No worries! The file check feature is for full vehicle wraps over 200 sq ft.\n\nFor smaller projects or partial wraps, you can still get a quote!\n\n1. Visit weprintwraps.com/quote\n2. Select your vehicle make & model\n3. Get instant sq ft pricing\n\nThen attach your artwork when you order — our team reviews all files before production.\n\nWant help with something else?", false);
    });
  }

  // ========================================
  // FILE UPLOAD HANDLER
  // ========================================
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Size check
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      addMessage("That file is too large (max 50MB). Please compress it or email it directly to Design@WePrintWraps.com", false);
      fileInput.value = '';
      return;
    }

    // Type check
    const allowedTypes = ['pdf', 'png', 'jpg', 'jpeg', 'psd', 'ai', 'eps', 'tif', 'tiff'];
    const ext = file.name.toLowerCase().split('.').pop();
    if (!allowedTypes.includes(ext)) {
      addMessage(`That file type (.${ext}) isn't supported. Please upload a PDF, PNG, JPG, AI, EPS, PSD, or TIFF file.`, false);
      fileInput.value = '';
      return;
    }

    hideQuickActions();
    hideAskTrigger();

    addMessage(`📎 Uploading: ${file.name}`, true);

    const progressDiv = document.createElement('div');
    progressDiv.className = 'wcai-upload-progress';
    progressDiv.innerHTML = `
      <div class="wcai-upload-text">Uploading your artwork... <span id="wcai-progress-pct">0%</span></div>
      <div class="wcai-upload-progress-bar">
        <div class="wcai-upload-progress-fill" id="wcai-progress-fill" style="width: 0%"></div>
      </div>
    `;
    messagesContainer.appendChild(progressDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      const timestamp = Date.now();
      const storagePath = `artwork-check/${sessionId}/${timestamp}-${file.name}`;

      let progress = 0;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + 10, 90);
        const pctEl = document.getElementById('wcai-progress-pct');
        const fillEl = document.getElementById('wcai-progress-fill');
        if (pctEl) pctEl.textContent = progress + '%';
        if (fillEl) fillEl.style.width = progress + '%';
      }, 200);

      const uploadResponse = await fetch(`${config.supabaseUrl}/storage/v1/object/media-library/${storagePath}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.supabaseAnonKey}`,
          'apikey': config.supabaseAnonKey,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: file
      });

      clearInterval(progressInterval);

      if (!uploadResponse.ok) {
        throw new Error('Upload failed: ' + uploadResponse.statusText);
      }

      const pctEl = document.getElementById('wcai-progress-pct');
      const fillEl = document.getElementById('wcai-progress-fill');
      if (pctEl) pctEl.textContent = '100%';
      if (fillEl) fillEl.style.width = '100%';

      const fileUrl = `${config.supabaseUrl}/storage/v1/object/public/media-library/${storagePath}`;
      setTimeout(() => progressDiv.remove(), 1000);
      fileUploadCount++;

      if (isCheckMyFileFlow) {
        showTyping();
        const checkResponse = await fetch(config.artworkCheckUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseAnonKey,
            'Authorization': 'Bearer ' + config.supabaseAnonKey
          },
          body: JSON.stringify({
            session_id: sessionId,
            file_url: fileUrl,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            customer_confirmed_full_wrap: true,
            geo_data: geoData
          })
        });

        const checkData = await checkResponse.json();
        hideTyping();

        if (checkData.success && checkData.message) {
          await addMessage(checkData.message, false, true);
          setTimeout(async () => {
            await addMessage("What email should our design team reach you at?", false, true);
          }, 1500);
        } else {
          addMessage("Got your file! Our design team will review it and email you with a detailed analysis and quote. What email should they reach you at?", false);
        }
      } else {
        showTyping();

        const chatResponse = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseAnonKey,
            'Authorization': 'Bearer ' + config.supabaseAnonKey
          },
          body: JSON.stringify({
            org: config.org,
            agent: config.agent,
            mode: config.mode,
            session_id: sessionId,
            message_text: `[Customer attached a file: ${file.name}]`,
            page_url: window.location.href,
            referrer: document.referrer,
            geo: geoData,
            attachments: [{
              url: fileUrl,
              type: file.type,
              name: file.name
            }]
          })
        });

        const data = await chatResponse.json();
        hideTyping();

        // BULLETPROOF: Check all possible response fields
        const agentReply = data.reply || data.response || data.message;
        if (agentReply) {
          await addMessage(agentReply, false, true);
        } else {
          addMessage(`Got your file! I can see you've attached ${file.name}. What would you like help with regarding this file?`, false);
        }
      }

      isCheckMyFileFlow = false;

    } catch (err) {
      console.error('[WCAI] Upload error:', err);
      const pctEl = document.getElementById('wcai-progress-pct');
      if (pctEl) pctEl.textContent = 'Failed';
      setTimeout(() => progressDiv.remove(), 2000);
      addMessage("Sorry, there was an issue uploading your file. Please try again or email it directly to Design@WePrintWraps.com", false);
    }

    fileInput.value = '';
  });

  // ========================================
  // SEND MESSAGE — with bulletproof response handling
  // ========================================
  async function sendMessage(text) {
    const messageText = text || input.value.trim();
    if (!messageText) return;

    hideQuickActions();
    hideAskTrigger();
    addMessage(messageText, true);
    input.value = '';
    sendBtn.disabled = true;
    showTyping();

    try {
      const payload = {
        org: config.org,
        agent: config.agent,
        mode: config.mode,
        session_id: sessionId,
        message_text: messageText,
        page_url: window.location.href,
        referrer: document.referrer,
        geo: geoData
      };

      // Include collected contact info
      if (collectedName) payload.customer_name = collectedName;
      if (collectedEmail) payload.customer_email = collectedEmail;
      if (collectedPhone) payload.customer_phone = collectedPhone;
      if (collectedOrderNumber) payload.order_number = collectedOrderNumber;

      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': config.supabaseAnonKey,
          'Authorization': 'Bearer ' + config.supabaseAnonKey
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      hideTyping();

      // BULLETPROOF: Check reply || response || message
      const agentReply = data.reply || data.response || data.message;
      if (agentReply) {
        await addMessage(agentReply, false, true);
        // Backend-confirmed quote receipt — only shows when a quote was actually emailed
        if (data.quote_sent && data.quote_email) {
          const amount = data.quote_amount ? ' ($' + Number(data.quote_amount).toLocaleString() + ')' : '';
          const ref = data.quote_number ? ' [' + data.quote_number + ']' : '';
          addMessage('✅ Quote emailed to ' + data.quote_email + amount + ref, false);
        }
      } else if (data.error) {
        // Edge function returned an error but might have a fallback reply
        addMessage("I hit a small snag — could you try that again? Or email us at hello@weprintwraps.com and we'll get right back to you!", false);
        console.error('[WCAI] API error:', data.error);
      } else {
        // Unknown response shape
        addMessage("Sorry about that! Let me try again — what were you looking for help with?", false);
        console.warn('[WCAI] Unexpected response shape:', data);
      }
    } catch (err) {
      hideTyping();
      addMessage("Connection error — please check your internet and try again, or email us at hello@weprintwraps.com!", false);
      console.error('[WCAI] Network error:', err);
    }

    sendBtn.disabled = false;
    input.focus();
  }

  // ========================================
  // QUICK ACTION HANDLERS
  // ========================================
  quickActionsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.wcai-quick-btn');
    if (btn) {
      const actionId = btn.getAttribute('data-action');

      if (actionId === 'check-file') {
        showCheckFileModal();
        return;
      }

      const action = quickActions.find(a => a.id === actionId);
      if (action && action.message) {
        sendMessage(action.message);
      }
    }
  });

  sendBtn.addEventListener('click', () => sendMessage());
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // ========================================
  // AUTO-OPEN WELCOME for logged-in users
  // If user is logged in and chat hasn't been interacted with yet,
  // show the welcome message immediately when they first open
  // ========================================
  if (userIsLoggedIn && !hasInteracted) {
    // Don't auto-open, but be ready with welcome when they click
    console.log('[WCAI] Logged-in user detected — onboarding skipped');
  }

  console.log('[WrapCommand AI] Chat widget v3 loaded', {
    org: config.org,
    mode: config.mode,
    session: sessionId,
    loggedIn: userIsLoggedIn,
    userName: collectedName || '(none)'
  });
})();

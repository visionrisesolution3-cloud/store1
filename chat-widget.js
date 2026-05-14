/**
 * LiveChat Pro — Visitor Widget
 * Drop this script on every page of the website.
 * Requires firebase-config.js to be loaded first.
 *
 * Usage in HTML (before </body>):
 *   <script src="firebase-config.js"></script>
 *   <script src="chat-widget.js"></script>
 */

(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────
  const BRAND_NAME    = 'Support Chat';
  const WELCOME_MSG   = 'Hi there 👋 How can we help you today?';
  const OFFLINE_MSG   = "We're away right now but will reply soon.";
  const ACCENT        = '#667eea';
  const ACCENT_DARK   = '#764ba2';
  // ────────────────────────────────────────────────────────

  // Wait for Firebase to be ready
  function waitForFirebase(cb, tries = 0) {
    if (tries > 40) return;
    if (typeof firebase !== 'undefined' && firebase.firestore) return cb();
    setTimeout(() => waitForFirebase(cb, tries + 1), 250);
  }

  waitForFirebase(init);

  function init() {
    const db = firebase.firestore();

    // ── Visitor identity (persists across pages via sessionStorage) ──
    let visitorId = sessionStorage.getItem('lcp_visitor_id');
    if (!visitorId) {
      visitorId = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('lcp_visitor_id', visitorId);
    }
    let chatId      = sessionStorage.getItem('lcp_chat_id') || null;
    let chatRef     = chatId ? db.collection('lcp_chats').doc(chatId) : null;
    let unsubMessages = null;
    let agentOnline = false;
    let isOpen      = false;

    // ── Inject CSS ──
    const style = document.createElement('style');
    style.textContent = `
      #lcp-wrap * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
      #lcp-wrap { position: fixed; bottom: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }

      /* Bubble */
      #lcp-bubble {
        width: 58px; height: 58px; border-radius: 50%;
        background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK});
        box-shadow: 0 6px 24px rgba(102,126,234,0.45);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s; border: none; outline: none;
        position: relative;
      }
      #lcp-bubble:hover { transform: scale(1.08); box-shadow: 0 8px 30px rgba(102,126,234,0.55); }
      #lcp-bubble svg { width: 26px; height: 26px; fill: white; transition: opacity 0.2s; }
      #lcp-bubble .lcp-close-icon { display: none; }
      #lcp-wrap.open #lcp-bubble .lcp-chat-icon { display: none; }
      #lcp-wrap.open #lcp-bubble .lcp-close-icon { display: block; }
      #lcp-unread {
        position: absolute; top: -3px; right: -3px; background: #ef4444;
        color: white; font-size: 11px; font-weight: 700; min-width: 18px; height: 18px;
        border-radius: 9px; display: none; align-items: center; justify-content: center;
        padding: 0 4px; border: 2px solid white;
      }
      #lcp-unread.show { display: flex; }

      /* Window */
      #lcp-window {
        width: 360px; height: 520px; background: white;
        border-radius: 18px; box-shadow: 0 16px 60px rgba(0,0,0,0.18);
        display: none; flex-direction: column; overflow: hidden;
        transform: translateY(12px) scale(0.97); opacity: 0;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      #lcp-wrap.open #lcp-window { display: flex; transform: translateY(0) scale(1); opacity: 1; }

      /* Header */
      #lcp-header {
        background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK});
        padding: 18px 18px 14px; color: white; flex-shrink: 0;
      }
      .lcp-header-top { display: flex; align-items: center; gap: 10px; }
      .lcp-avatar { width: 38px; height: 38px; background: rgba(255,255,255,0.25); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
      .lcp-header-title { font-size: 15px; font-weight: 700; }
      .lcp-header-status { font-size: 12px; opacity: 0.85; display: flex; align-items: center; gap: 5px; margin-top: 2px; }
      .lcp-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; display: inline-block; }
      .lcp-status-dot.away { background: #fbbf24; }

      /* Name form */
      #lcp-name-form { padding: 20px 18px; display: flex; flex-direction: column; gap: 12px; flex: 1; justify-content: center; align-items: center; text-align: center; }
      .lcp-welcome-icon { font-size: 36px; margin-bottom: 4px; }
      .lcp-welcome-title { font-size: 17px; font-weight: 700; color: #1f2937; }
      .lcp-welcome-sub { font-size: 13px; color: #6b7280; line-height: 1.5; }
      .lcp-name-inp {
        width: 100%; padding: 11px 14px; border: 1.5px solid #e5e7eb;
        border-radius: 10px; font-size: 14px; outline: none; transition: border-color 0.2s;
        color: #1f2937;
      }
      .lcp-name-inp:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }
      .lcp-start-btn {
        width: 100%; padding: 12px; background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK});
        color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 700;
        cursor: pointer; transition: opacity 0.2s;
      }
      .lcp-start-btn:hover { opacity: 0.9; }

      /* Messages */
      #lcp-messages { flex: 1; overflow-y: auto; padding: 14px 14px 8px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
      #lcp-messages::-webkit-scrollbar { width: 4px; }
      #lcp-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }

      .lcp-msg { display: flex; flex-direction: column; max-width: 78%; }
      .lcp-msg.visitor { align-self: flex-end; align-items: flex-end; }
      .lcp-msg.agent  { align-self: flex-start; align-items: flex-start; }
      .lcp-bubble-msg {
        padding: 10px 14px; border-radius: 16px; font-size: 13.5px; line-height: 1.5;
        word-break: break-word;
      }
      .lcp-msg.visitor .lcp-bubble-msg { background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK}); color: white; border-bottom-right-radius: 4px; }
      .lcp-msg.agent  .lcp-bubble-msg { background: #f3f4f6; color: #1f2937; border-bottom-left-radius: 4px; }
      .lcp-msg-time { font-size: 10.5px; color: #9ca3af; margin-top: 3px; padding: 0 4px; }

      .lcp-system-msg { text-align: center; font-size: 12px; color: #9ca3af; padding: 4px 0; }

      /* Typing indicator */
      .lcp-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; background: #f3f4f6; border-radius: 16px; border-bottom-left-radius: 4px; width: fit-content; }
      .lcp-typing span { width: 7px; height: 7px; background: #9ca3af; border-radius: 50%; animation: lcp-bounce 1.2s infinite; }
      .lcp-typing span:nth-child(2) { animation-delay: 0.2s; }
      .lcp-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes lcp-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }

      /* Input area */
      #lcp-input-area { padding: 10px 12px 14px; border-top: 1px solid #f3f4f6; display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }
      #lcp-textarea {
        flex: 1; padding: 10px 12px; border: 1.5px solid #e5e7eb; border-radius: 12px;
        font-size: 13.5px; resize: none; outline: none; max-height: 100px;
        font-family: inherit; line-height: 1.4; transition: border-color 0.2s;
        color: #1f2937;
      }
      #lcp-textarea:focus { border-color: ${ACCENT}; }
      #lcp-send {
        width: 38px; height: 38px; background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_DARK});
        border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center;
        justify-content: center; flex-shrink: 0; transition: opacity 0.2s;
      }
      #lcp-send:hover { opacity: 0.85; }
      #lcp-send svg { width: 18px; height: 18px; fill: white; }
      .lcp-powered { text-align: center; font-size: 10.5px; color: #d1d5db; padding: 4px 0 2px; flex-shrink: 0; }
    `;
    document.head.appendChild(style);

    // ── Inject HTML ──
    const wrap = document.createElement('div');
    wrap.id = 'lcp-wrap';
    wrap.innerHTML = `
      <div id="lcp-window">
        <div id="lcp-header">
          <div class="lcp-header-top">
            <div class="lcp-avatar">🛍️</div>
            <div>
              <div class="lcp-header-title">${BRAND_NAME}</div>
              <div class="lcp-header-status">
                <span class="lcp-status-dot" id="lcp-status-dot"></span>
                <span id="lcp-status-text">Online</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Name form (shown before chat starts) -->
        <div id="lcp-name-form">
          <div class="lcp-welcome-icon">💬</div>
          <div class="lcp-welcome-title">Start a conversation</div>
          <div class="lcp-welcome-sub">${WELCOME_MSG}</div>
          <input class="lcp-name-inp" id="lcp-name-inp" type="text" placeholder="Your name (optional)" maxlength="40" />
          <button class="lcp-start-btn" id="lcp-start-btn">Start Chat →</button>
        </div>

        <!-- Messages area (hidden until chat starts) -->
        <div id="lcp-messages" style="display:none;"></div>

        <!-- Input (hidden until chat starts) -->
        <div id="lcp-input-area" style="display:none;">
          <textarea id="lcp-textarea" rows="1" placeholder="Type a message…"></textarea>
          <button id="lcp-send">
            <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="lcp-powered" id="lcp-input-area-powered" style="display:none;">Powered by LiveChat Pro</div>
      </div>

      <button id="lcp-bubble" aria-label="Open chat">
        <div id="lcp-unread"></div>
        <svg class="lcp-chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        <svg class="lcp-close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>
    `;
    document.body.appendChild(wrap);

    // ── Element refs ──
    const bubble      = document.getElementById('lcp-bubble');
    const window_     = document.getElementById('lcp-window');
    const nameForm    = document.getElementById('lcp-name-form');
    const nameInp     = document.getElementById('lcp-name-inp');
    const startBtn    = document.getElementById('lcp-start-btn');
    const messagesEl  = document.getElementById('lcp-messages');
    const inputArea   = document.getElementById('lcp-input-area');
    const poweredEl   = document.getElementById('lcp-input-area-powered');
    const textarea    = document.getElementById('lcp-textarea');
    const sendBtn     = document.getElementById('lcp-send');
    const unreadBadge = document.getElementById('lcp-unread');
    const statusDot   = document.getElementById('lcp-status-dot');
    const statusText  = document.getElementById('lcp-status-text');

    let unreadCount = 0;

    // ── Toggle open/close ──
    bubble.addEventListener('click', () => {
      isOpen = !isOpen;
      wrap.classList.toggle('open', isOpen);
      if (isOpen) {
        unreadCount = 0;
        unreadBadge.textContent = '';
        unreadBadge.classList.remove('show');
        // If already have a chat, show messages
        if (chatId) showChatUI();
        setTimeout(() => textarea.focus && textarea.focus(), 300);
      }
    });

    // ── Start chat ──
    startBtn.addEventListener('click', startChat);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') startChat(); });

    async function startChat() {
      const name = nameInp.value.trim() || 'Visitor';
      startBtn.disabled = true;
      startBtn.textContent = 'Connecting…';

      try {
        // Create chat document
        const ref = await db.collection('lcp_chats').add({
          visitorId,
          visitorName:   name,
          status:        'open',
          agentOnline:   false,
          createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
          lastMessage:   '',
          lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
          unreadByAgent: 0,
          currentPage:   window.location.pathname,
        });
        chatId  = ref.id;
        chatRef = ref;
        sessionStorage.setItem('lcp_chat_id', chatId);

        // Send system welcome message
        await sendSystemMessage(`${name} started a chat`);

        showChatUI();
        listenMessages();
        trackPage();
      } catch (e) {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Chat →';
        console.error('Chat start error:', e);
      }
    }

    function showChatUI() {
      nameForm.style.display   = 'none';
      messagesEl.style.display = 'flex';
      inputArea.style.display  = 'flex';
      poweredEl.style.display  = 'block';
      if (!unsubMessages) listenMessages();
    }

    // ── Real-time message listener ──
    function listenMessages() {
      if (!chatId) return;
      if (unsubMessages) unsubMessages();

      unsubMessages = db.collection('lcp_chats').doc(chatId)
        .collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snap => {
          messagesEl.innerHTML = '';
          snap.forEach(doc => renderMessage(doc.data()));
          scrollBottom();
        });

      // Listen for agent typing / online status
      db.collection('lcp_chats').doc(chatId).onSnapshot(doc => {
        if (!doc.exists) return;
        const d = doc.data();
        agentOnline = d.agentOnline || false;
        statusDot.className = 'lcp-status-dot' + (agentOnline ? '' : ' away');
        statusText.textContent = agentOnline ? 'Online' : 'Away';

        // Show typing indicator
        const typing = document.getElementById('lcp-agent-typing');
        if (d.agentTyping) {
          if (!typing) {
            const t = document.createElement('div');
            t.id = 'lcp-agent-typing';
            t.className = 'lcp-msg agent';
            t.innerHTML = '<div class="lcp-typing"><span></span><span></span><span></span></div>';
            messagesEl.appendChild(t);
            scrollBottom();
          }
        } else {
          if (typing) typing.remove();
        }
      });
    }

    function renderMessage(msg) {
      if (msg.type === 'system') {
        const el = document.createElement('div');
        el.className = 'lcp-system-msg';
        el.textContent = msg.text;
        messagesEl.appendChild(el);
        return;
      }
      const el = document.createElement('div');
      el.className = `lcp-msg ${msg.sender}`;
      const time = msg.timestamp?.toDate ? formatTime(msg.timestamp.toDate()) : '';
      el.innerHTML = `
        <div class="lcp-bubble-msg">${escHtml(msg.text)}</div>
        <div class="lcp-msg-time">${time}</div>
      `;
      messagesEl.appendChild(el);

      // Unread badge if window closed and message is from agent
      if (!isOpen && msg.sender === 'agent') {
        unreadCount++;
        unreadBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        unreadBadge.classList.add('show');
      }
    }

    // ── Send message ──
    sendBtn.addEventListener('click', sendMessage);
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Auto-resize textarea
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';

      // Visitor typing indicator for agent
      if (chatRef) {
        chatRef.update({ visitorTyping: textarea.value.length > 0 }).catch(() => {});
      }
    });

    async function sendMessage() {
      const text = textarea.value.trim();
      if (!text || !chatId) return;
      textarea.value = '';
      textarea.style.height = 'auto';

      const name = sessionStorage.getItem('lcp_visitor_name') || 'Visitor';

      try {
        const msgData = {
          text,
          sender:      'visitor',
          senderName:  name,
          timestamp:   firebase.firestore.FieldValue.serverTimestamp(),
          read:        false,
        };
        await db.collection('lcp_chats').doc(chatId)
          .collection('messages').add(msgData);

        // Update chat doc
        await db.collection('lcp_chats').doc(chatId).update({
          lastMessage:    text,
          lastMessageAt:  firebase.firestore.FieldValue.serverTimestamp(),
          unreadByAgent:  firebase.firestore.FieldValue.increment(1),
          visitorTyping:  false,
          currentPage:    window.location.pathname,
        });
      } catch (e) {
        console.error('Send error:', e);
      }
    }

    async function sendSystemMessage(text) {
      if (!chatId) return;
      await db.collection('lcp_chats').doc(chatId).collection('messages').add({
        text,
        sender:    'system',
        type:      'system',
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    // ── Track current page ──
    function trackPage() {
      if (!chatRef) return;
      chatRef.update({ currentPage: window.location.pathname }).catch(() => {});
    }

    // ── Helpers ──
    function scrollBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function formatTime(date) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function escHtml(str) {
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
    }

    // ── Restore existing chat on page reload ──
    if (chatId) {
      showChatUI();
      listenMessages();
    }
  }
})();

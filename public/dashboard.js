// ==================== STATE ====================
let selectedChatJid = null;
let pollingInterval = null;
let lastMessageCount = 0;

// ==================== DOM ELEMENTS ====================
const chatList = document.getElementById('chatList');
const chatCount = document.getElementById('chatCount');
const searchInput = document.getElementById('searchInput');
const chatHeader = document.getElementById('chatHeader');
const chatName = document.getElementById('chatName');
const chatPhone = document.getElementById('chatPhone');
const chatAvatar = document.getElementById('chatAvatar');
const messagesContainer = document.getElementById('messagesContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const btnToggleBot = document.getElementById('btnToggleBot');
const textInput = document.getElementById('textInput');
const btnSend = document.getElementById('btnSend');
const inputHint = document.getElementById('inputHint');

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    loadChats();
    setInterval(loadChats, 3000); // Refresh chat list every 3 seconds

    // Event listeners
    searchInput.addEventListener('input', filterChats);
    btnToggleBot.addEventListener('click', toggleBot);
    btnSend.addEventListener('click', sendMessage);
    textInput.addEventListener('keydown', handleKeyDown);
    textInput.addEventListener('input', autoResize);
});

// ==================== CHAT LIST ====================
async function loadChats() {
    try {
        const response = await fetch('/api/chats');
        const chats = await response.json();

        chatCount.textContent = chats.length;

        if (chats.length === 0) {
            chatList.innerHTML = `
                <div class="no-chats">
                    <span>📭</span>
                    <p>No hay conversaciones activas</p>
                </div>
            `;
            return;
        }

        const searchTerm = searchInput.value.toLowerCase();
        const filteredChats = chats.filter(chat =>
            chat.phoneNumber.includes(searchTerm) ||
            chat.name.toLowerCase().includes(searchTerm)
        );

        chatList.innerHTML = filteredChats.map(chat => `
            <div class="chat-item ${chat.jid === selectedChatJid ? 'active' : ''}" 
                 onclick="selectChat('${encodeURIComponent(chat.jid)}')">
                <div class="avatar">${getInitials(chat.phoneNumber)}</div>
                <div class="info">
                    <div class="name">
                        +${chat.phoneNumber}
                        ${chat.isPaused ? '<span class="paused-indicator">PAUSADO</span>' : ''}
                    </div>
                    <div class="preview">${chat.lastMessage || 'Sin mensajes'}</div>
                </div>
                <div class="meta">
                    <div class="time">${formatTime(chat.lastActivity)}</div>
                    <div class="badge">${chat.messageCount}</div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error loading chats:', err);
    }
}

function filterChats() {
    loadChats();
}

// ==================== SELECT CHAT ====================
async function selectChat(encodedJid) {
    const jid = decodeURIComponent(encodedJid);
    selectedChatJid = jid;

    // Update UI
    welcomeScreen.style.display = 'none';
    btnToggleBot.disabled = false;

    // Highlight selected chat
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget?.classList.add('active');

    // Load messages
    await loadMessages();

    // Start polling for this chat
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(loadMessages, 2000);
}

async function loadMessages() {
    if (!selectedChatJid) return;

    try {
        const response = await fetch(`/api/chats/${encodeURIComponent(selectedChatJid)}/messages`);
        const data = await response.json();

        // Update header
        chatPhone.textContent = `+${data.phoneNumber || selectedChatJid.split('@')[0]}`;
        chatName.textContent = `+${data.phoneNumber || selectedChatJid.split('@')[0]}`;
        chatAvatar.textContent = getInitials(data.phoneNumber || '');

        // Update bot status UI
        updateBotStatusUI(data.isPaused);

        // Check if we have new messages
        if (data.messages.length !== lastMessageCount) {
            lastMessageCount = data.messages.length;
            renderMessages(data.messages);
        }

    } catch (err) {
        console.error('Error loading messages:', err);
    }
}

function renderMessages(messages) {
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="welcome-screen">
                <p>No hay mensajes en esta conversación</p>
            </div>
        `;
        return;
    }

    messagesContainer.innerHTML = `
        <div class="messages-list">
            ${messages.map(msg => `
                <div class="message ${msg.from}">
                    ${msg.from !== 'client' ? `<div class="sender-tag">${msg.from === 'bot' ? '🤖 Bot' : '👤 Tú'}</div>` : ''}
                    <div class="text">${escapeHtml(msg.text)}</div>
                    <div class="time">${formatMessageTime(msg.timestamp)}</div>
                </div>
            `).join('')}
        </div>
    `;

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==================== BOT CONTROL ====================
async function toggleBot() {
    if (!selectedChatJid) return;

    try {
        const response = await fetch(`/api/chats/${encodeURIComponent(selectedChatJid)}/toggle-bot`, {
            method: 'POST'
        });
        const data = await response.json();

        updateBotStatusUI(data.isPaused);
        loadChats(); // Refresh chat list to show paused status

    } catch (err) {
        console.error('Error toggling bot:', err);
    }
}

function updateBotStatusUI(isPaused) {
    const statusDot = btnToggleBot.querySelector('.status-dot');
    const btnText = btnToggleBot.querySelector('.btn-text');

    if (isPaused) {
        statusDot.classList.add('paused');
        statusDot.classList.remove('active');
        btnText.textContent = 'Bot Pausado';
        btnToggleBot.style.background = 'var(--warning)';
        btnToggleBot.style.color = '#000';

        textInput.disabled = false;
        textInput.placeholder = 'Escribe un mensaje...';
        btnSend.disabled = false;
        inputHint.textContent = '👤 Modo manual - Tus mensajes serán enviados directamente';
        inputHint.classList.add('manual');
    } else {
        statusDot.classList.remove('paused');
        statusDot.classList.add('active');
        btnText.textContent = 'Bot Activo';
        btnToggleBot.style.background = '';
        btnToggleBot.style.color = '';

        textInput.disabled = true;
        textInput.placeholder = 'El bot está activo. Pausalo para escribir manualmente...';
        btnSend.disabled = true;
        inputHint.textContent = '🤖 El bot está respondiendo automáticamente';
        inputHint.classList.remove('manual');
    }
}

// ==================== SEND MESSAGE ====================
async function sendMessage() {
    const message = textInput.value.trim();
    if (!message || !selectedChatJid) return;

    try {
        const response = await fetch(`/api/chats/${encodeURIComponent(selectedChatJid)}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        if (response.ok) {
            textInput.value = '';
            autoResize();
            loadMessages(); // Refresh to show sent message
        } else {
            const error = await response.json();
            alert('Error: ' + error.error);
        }

    } catch (err) {
        console.error('Error sending message:', err);
        alert('Error al enviar mensaje');
    }
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function autoResize() {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
}

// ==================== UTILITIES ====================
function getInitials(phoneNumber) {
    if (!phoneNumber) return '?';
    // Return last 2 digits
    return phoneNumber.slice(-2);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function formatMessageTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
}

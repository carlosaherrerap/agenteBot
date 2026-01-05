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
const btnLogout = document.getElementById('btnLogout');
const textInput = document.getElementById('textInput');
const btnSend = document.getElementById('btnSend');
// Status indicators
const indSQL = document.getElementById('indSQL');
const indRedis = document.getElementById('indRedis');
const indWA = document.getElementById('indWA');

// Layout sections
const messageInputArea = document.getElementById('messageInputArea');
const botStatusDot = document.getElementById('botStatusDot');
const btnToggleText = document.getElementById('btnToggleText');

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    loadChats();
    checkSystemStatus();
    setInterval(loadChats, 3000);
    setInterval(checkSystemStatus, 5000);

    // Event listeners
    searchInput.addEventListener('input', filterChats);
    btnToggleBot.addEventListener('click', toggleBot);
    btnLogout.addEventListener('click', logoutSession);
    btnSend.addEventListener('click', sendMessage);
    textInput.addEventListener('keydown', handleKeyDown);
    textInput.addEventListener('input', autoResize);
});

// ==================== SYSTEM STATUS ====================
async function checkSystemStatus() {
    try {
        const response = await fetch('/api/connection-status');
        const data = await response.json();

        // Update indicators
        updateIndicator(indSQL, data.sql);
        updateIndicator(indRedis, data.redis);
        updateIndicator(indWA, data.whatsapp);

        // If WhatsApp disconnected, redirect to QR page
        if (!data.whatsapp && data.state === 'disconnected') {
            // Give it a moment in case of temporary disconnect
            setTimeout(async () => {
                const recheck = await fetch('/api/connection-status');
                const recheckData = await recheck.json();
                if (!recheckData.whatsapp) {
                    window.location.href = '/';
                }
            }, 3000);
        }
    } catch (err) {
        console.error('Error checking status:', err);
    }
}

function updateIndicator(element, isConnected) {
    if (isConnected) {
        element.classList.add('on');
    } else {
        element.classList.remove('on');
    }
}

// ==================== LOGOUT ====================
async function logoutSession() {
    if (!confirm('¿Seguro que deseas cerrar la sesión de WhatsApp?\nTendrás que escanear el QR nuevamente.')) {
        return;
    }

    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/';
        } else {
            const error = await response.json();
            alert('Error al cerrar sesión: ' + error.error);
        }
    } catch (err) {
        console.error('Error logging out:', err);
        alert('Error al cerrar sesión');
    }
}

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
                <div class="chat-avatar">${getInitials(chat.phoneNumber)}</div>
                <div class="chat-details">
                    <div class="chat-top">
                        <h3>+${chat.phoneNumber}</h3>
                        <span class="chat-time">${formatTime(chat.lastActivity)}</span>
                    </div>
                    <div class="chat-preview">
                        ${chat.isPaused ? '⏸️ [PAUSADO] ' : ''}${chat.lastMessage || 'Sin mensajes'}
                    </div>
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
    try {
        const jid = decodeURIComponent(encodedJid);
        console.log('Selecting chat:', jid);
        selectedChatJid = jid;

        // Update UI Visibility
        welcomeScreen.style.display = 'none';
        chatHeader.style.visibility = 'visible';
        messageInputArea.style.visibility = 'visible';
        btnToggleBot.disabled = false;

        // Highlight selected chat
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
        const clickedItem = document.querySelector(`.chat-item[onclick*="${encodedJid}"]`);
        if (clickedItem) {
            clickedItem.classList.add('active');
        }

        // Reset message count for new chat
        lastMessageCount = 0;

        // Load messages
        await loadMessages();

        // Start polling for this chat
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(loadMessages, 2000);

        console.log('Chat selected successfully:', jid);
    } catch (err) {
        console.error('Error selecting chat:', err);
    }
}

async function loadMessages() {
    if (!selectedChatJid) return;

    try {
        const response = await fetch(`/api/chats/${encodeURIComponent(selectedChatJid)}/messages`);
        const data = await response.json();

        // Update header
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
    messagesContainer.innerHTML = messages.map(msg => `
        <div class="message ${msg.from}">
            <div class="text">${escapeHtml(msg.text)}</div>
            <span class="message-time">${formatMessageTime(msg.timestamp)}</span>
        </div>
    `).join('');

    lucide.createIcons();

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
    if (isPaused) {
        botStatusDot.style.background = '#dc3545';
        btnToggleText.textContent = 'Bot Pausado';
        btnToggleBot.classList.add('paused');

        textInput.disabled = false;
        textInput.placeholder = 'Escribe un mensaje...';
        btnSend.disabled = false;
        btnSend.classList.add('active');
    } else {
        botStatusDot.style.background = '#00a884';
        btnToggleText.textContent = 'Bot Activo';
        btnToggleBot.classList.remove('paused');

        textInput.disabled = true;
        textInput.placeholder = 'El bot está activo...';
        btnSend.disabled = true;
        btnSend.classList.remove('active');
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

const socket = io();

const lobby = document.getElementById('lobby');
const game = document.getElementById('game');
const nameInput = document.getElementById('nameInput');
const roomInput = document.getElementById('roomInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const lobbyError = document.getElementById('lobbyError');
const copyRoom = document.getElementById('copyRoom');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restartBtn');
const leaveBtn = document.getElementById('leaveBtn');
const themeBtn = document.getElementById('themeBtn');
const lobbyThemeBtn = document.getElementById('lobbyThemeBtn');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const pileEl = document.getElementById('pile');
const ringBtn = document.getElementById('ringBtn');
const targetText = document.getElementById('targetText');
const pCards = [document.getElementById('p0Card'), document.getElementById('p1Card')];
const grids = [document.getElementById('grid0'), document.getElementById('grid1')];

let myIndex = null;
let state = null;
let selectedPileId = null;
let pendingCells = [new Set(), new Set()];
let lastRoomCode = '';

const savedTheme = localStorage.getItem('x-ring-theme');
if (savedTheme === 'dark') document.body.classList.add('dark');
updateThemeButton();

function updateThemeButton() {
  const label = document.body.classList.contains('dark') ? 'Light' : 'Dark';
  if (themeBtn) themeBtn.textContent = label;
  if (lobbyThemeBtn) lobbyThemeBtn.textContent = label;
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('x-ring-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  updateThemeButton();
}

const shapeFns = {
  heart: t => {
    const a = 2 * Math.PI * t;
    const x = 16 * Math.pow(Math.sin(a), 3);
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2*a) - 2 * Math.cos(3*a) - Math.cos(4*a));
    return [50 + x * 2.1, 51 + y * 2.1];
  },
  star: t => {
    const p = 10;
    const a = 2 * Math.PI * t;
    const r = t * p % 1 < .5 ? 35 : 21;
    return [50 + Math.cos(a * 5) * r, 50 + Math.sin(a * 5) * r];
  },
  fish: t => {
    const a = 2 * Math.PI * t;
    const bodyX = 48 + Math.cos(a) * 30;
    const bodyY = 50 + Math.sin(a) * 18;
    if (t > .78) return [78 + (t - .78) * 70, 50 + Math.sin((t-.78)*30) * 22];
    return [bodyX, bodyY];
  },
  paw: t => {
    const spots = [[35,62],[50,60],[65,62],[32,35],[50,30],[68,35]];
    const s = spots[Math.floor(t * spots.length) % spots.length];
    const a = 2 * Math.PI * ((t * spots.length) % 1);
    const r = s[1] > 50 ? 17 : 11;
    return [s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r];
  },
  spiral: t => {
    const a = 6 * Math.PI * t;
    const r = 6 + 37 * t;
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
  },
  wave: t => [10 + t * 80, 50 + Math.sin(t * Math.PI * 4) * 25]
};

function myName() {
  return nameInput.value.trim() || 'Player';
}

function showGame() {
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
}

function makeGrid(index) {
  grids[index].innerHTML = '';
  for (let i = 0; i < 54; i++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.dataset.player = index;
    cell.setAttribute('aria-label', `Player ${index + 1} cell ${i + 1}`);
    grids[index].appendChild(cell);
  }
}
makeGrid(0);
makeGrid(1);

createBtn.onclick = () => socket.emit('createRoom', { name: myName() });
joinBtn.onclick = () => socket.emit('joinRoom', { name: myName(), roomCode: roomInput.value });
restartBtn.onclick = () => {
  pendingCells = [new Set(), new Set()];
  socket.emit('restart');
};

leaveBtn.onclick = () => {
  socket.emit('leaveRoom');
  state = null;
  myIndex = null;
  selectedPileId = null;
  pendingCells = [new Set(), new Set()];
  lastRoomCode = '';
  game.classList.add('hidden');
  lobby.classList.remove('hidden');
  statusEl.textContent = 'Waiting...';
  lobbyError.textContent = '';
};

themeBtn.onclick = toggleTheme;
lobbyThemeBtn.onclick = toggleTheme;
copyRoom.onclick = async () => {
  if (!lastRoomCode) return;
  await navigator.clipboard?.writeText(lastRoomCode);
  copyRoom.textContent = 'COPIED';
  setTimeout(() => copyRoom.textContent = lastRoomCode, 700);
};

ringBtn.onclick = () => {
  if (!state || state.phase !== 'draw' || myIndex === state.activePlayer) return;
  if (!selectedPileId) {
    statusEl.textContent = 'Tap the number first, then press the ring.';
    ringBtn.classList.add('wrongRing');
    setTimeout(() => ringBtn.classList.remove('wrongRing'), 450);
    return;
  }
  socket.emit('foundNumber', { pileId: selectedPileId });
};

function canDraw() {
  return state && state.phase === 'draw' && myIndex === state.activePlayer && !state.winner;
}

function fillCell(cell) {
  if (!canDraw()) return;
  const player = Number(cell.dataset.player);
  const i = Number(cell.dataset.index);
  if (player !== myIndex) return;

  const confirmed = new Set(state.players[player]?.xCells || []);
  if (confirmed.has(i)) return;

  // Do not permanently lock pending cells on the client.
  // The server is the source of truth and ignores duplicates safely.
  socket.emit('addX', { cellIndex: i });
}

function markSingleCell(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  e.preventDefault();
  fillCell(cell);
}

// Tap-only rule: one tap/click fills one X.
// Holding or dragging across the sheet will not fill extra cells.
document.addEventListener('pointerdown', markSingleCell, { passive: false });

function syncGridCounts(players) {
  players.forEach(p => {
    const confirmed = new Set(p.xCells || []);
    pendingCells[p.index] = new Set();

    [...grids[p.index].children].forEach((cell, i) => {
      const filled = confirmed.has(i);
      cell.classList.toggle('filled', filled);
      cell.textContent = filled ? 'X' : '';
      cell.disabled = false;
      cell.classList.toggle('locked', !(state && state.phase === 'draw' && myIndex === state.activePlayer && p.index === myIndex));
    });
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fits(px, py, placed, radius, width, height) {
  if (px < radius || py < radius || px > width - radius || py > height - radius) return false;
  for (const point of placed) {
    const dx = point.x - px;
    const dy = point.y - py;
    if (Math.hypot(dx, dy) < radius * 2.05) return false;
  }
  return true;
}

function computePileLayout(shape, total) {
  const fn = shapeFns[shape] || shapeFns.spiral;
  const rect = pileEl.getBoundingClientRect();
  const width = Math.max(rect.width || pileEl.clientWidth || 560, 300);
  const height = Math.max(rect.height || pileEl.clientHeight || 460, 340);
  const areaRadius = Math.sqrt((width * height) / (total * Math.PI)) * 0.54;
  const radius = Math.max(18, Math.min(30, width / 14, height / 13, areaRadius));
  const placed = [];
  const coords = [];

  for (let i = 0; i < total; i++) {
    const t = total <= 1 ? 0.5 : i / total;
    const [bx, by] = fn(t);
    const baseX = bx / 100 * width;
    const baseY = by / 100 * height;
    let point = null;

    const seed = i + 1;
    const maxRings = 34;
    const triesPerRing = 24;

    for (let ring = 0; ring <= maxRings && !point; ring++) {
      const step = ring === 0 ? 0 : radius * 0.62;
      const currentRadius = ring * step;
      for (let stepIndex = 0; stepIndex < triesPerRing; stepIndex++) {
        const angle = ((seed * 37 + stepIndex * 360 / triesPerRing) * Math.PI) / 180;
        const px = clamp(baseX + Math.cos(angle) * currentRadius, radius, width - radius);
        const py = clamp(baseY + Math.sin(angle) * currentRadius, radius, height - radius);
        if (fits(px, py, placed, radius, width, height)) {
          point = { x: px, y: py };
          break;
        }
      }
    }

    if (!point) {
      outer: for (let row = radius; row <= height - radius; row += radius * 2.15) {
        for (let col = radius; col <= width - radius; col += radius * 2.15) {
          if (fits(col, row, placed, radius, width, height)) {
            point = { x: col, y: row };
            break outer;
          }
        }
      }
    }

    point ||= {
      x: clamp(baseX, radius, width - radius),
      y: clamp(baseY, radius, height - radius)
    };
    placed.push(point);
    coords.push({ x: point.x, y: point.y, radius });
  }
  return coords;
}

function renderPile() {
  pileEl.innerHTML = '';
  const items = state.pile || [];
  const layout = computePileLayout(state.shape, items.length);
  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = `num ${item.used ? 'used' : ''} ${selectedPileId === item.id ? 'selected' : ''}`;
    btn.textContent = item.num;
    const pos = layout[i];
    btn.style.left = `${pos.x}px`;
    btn.style.top = `${pos.y}px`;
    btn.style.width = `${pos.radius * 2}px`;
    btn.style.height = `${pos.radius * 2}px`;
    btn.onclick = () => handleNumberClick(item, btn);
    pileEl.appendChild(btn);
  });
}

function handleNumberClick(item, btn) {
  if (!state || item.used) return;
  if (state.phase === 'choose' && myIndex === state.activePlayer) {
    selectedPileId = null;
    socket.emit('chooseNumber', { pileId: item.id });
    return;
  }
  if (state.phase === 'draw' && myIndex !== state.activePlayer) {
    selectedPileId = item.id;
    renderPile();
    ringBtn.classList.add('armed');
    statusEl.textContent = `Selected ${item.num}. Press the ring to confirm.`;
  }
}

function renderChat() {
  if (!chatMessages || !state) return;
  chatMessages.innerHTML = '';
  const messages = state.chat || [];
  messages.forEach(msg => {
    const row = document.createElement('div');
    row.className = `chatMsg ${msg.playerId === socket.id ? 'mine' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'chatMeta';
    meta.textContent = msg.name || 'Player';

    const bubble = document.createElement('div');
    bubble.className = 'chatBubble';
    bubble.textContent = msg.text || '';

    row.appendChild(meta);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener('submit', e => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !state) return;
  socket.emit('chatMessage', { text });
  chatInput.value = '';
});

function renderWinner() {
  document.querySelector('.winBanner')?.remove();
  if (!state || state.phase !== 'ended') return;
  const banner = document.createElement('div');
  banner.className = 'winBanner';
  const winnerText = state.winner === 'draw'
    ? 'Draw game'
    : `${state.players.find(p => p.index === state.winner)?.name || 'Player'} wins`;
  banner.innerHTML = `<div class="card"><h1>${winnerText}</h1><p>${state.players.map(p => `${p.name}: ${p.xCount} Xs`).join(' · ')}</p><br><button class="ghost" onclick="document.querySelector('.winBanner').remove()">Close</button></div>`;
  document.body.appendChild(banner);
}

function render() {
  showGame();
  lastRoomCode = state.code;
  copyRoom.textContent = state.code;
  statusEl.textContent = state.message || '';
  myIndex = state.players.find(p => p.id === socket.id)?.index ?? myIndex;

  state.players.forEach(p => {
    const card = pCards[p.index];
    card.querySelector('h2').textContent = p.name;
    card.querySelector('.badge').textContent = `${p.xCount}/54`;
    card.classList.toggle('active', state.phase !== 'waiting' && state.activePlayer === p.index);
    card.classList.toggle('me', myIndex === p.index);
  });

  if (state.target) {
    const searcher = state.players[1 - state.activePlayer];
    targetText.textContent = `${searcher?.name || 'Searcher'} must find: ${state.target.num}`;
  } else if (state.phase === 'choose') {
    targetText.textContent = `${state.players[state.activePlayer]?.name || 'Player'} choose a number from the pile.`;
  } else {
    targetText.textContent = state.message || 'Waiting.';
  }

  ringBtn.disabled = !(state.phase === 'draw' && myIndex !== state.activePlayer);
  if (ringBtn.disabled) {
    selectedPileId = null;
    ringBtn.classList.remove('armed');
  } else {
    ringBtn.classList.toggle('armed', Boolean(selectedPileId));
  }

  syncGridCounts(state.players);
  renderPile();
  renderChat();
  renderWinner();
}

socket.on('roomState', next => {
  const previousTargetId = state?.target?.id;
  const previousPhase = state?.phase;
  state = next;
  if (previousTargetId !== state.target?.id || previousPhase !== state.phase) selectedPileId = null;
  if (!state.players.some(p => p.xCount > 0)) pendingCells = [new Set(), new Set()];
  render();
});
socket.on('errorMessage', msg => {
  lobbyError.textContent = msg;
  if (state) statusEl.textContent = msg;
});

socket.on('leftRoom', () => {
  state = null;
  myIndex = null;
  selectedPileId = null;
  pendingCells = [new Set(), new Set()];
  lastRoomCode = '';
  game.classList.add('hidden');
  lobby.classList.remove('hidden');
});


window.addEventListener('resize', () => {
  if (state) renderPile();
});

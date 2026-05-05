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
const pileEl = document.getElementById('pile');
const ringBtn = document.getElementById('ringBtn');
const targetText = document.getElementById('targetText');
const pCards = [document.getElementById('p0Card'), document.getElementById('p1Card')];
const grids = [document.getElementById('grid0'), document.getElementById('grid1')];

let myIndex = null;
let state = null;
let ringArmed = false;
let dragging = false;
let localFilled = [new Set(), new Set()];
let lastRoomCode = '';

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
  localFilled = [new Set(), new Set()];
  socket.emit('restart');
};
copyRoom.onclick = async () => {
  if (!lastRoomCode) return;
  await navigator.clipboard?.writeText(lastRoomCode);
  copyRoom.textContent = 'COPIED';
  setTimeout(() => copyRoom.textContent = lastRoomCode, 700);
};

ringBtn.onclick = () => {
  if (!state || state.phase !== 'draw' || myIndex === state.activePlayer) return;
  ringArmed = !ringArmed;
  ringBtn.classList.toggle('armed', ringArmed);
};

function canDraw() {
  return state && state.phase === 'draw' && myIndex === state.activePlayer && !state.winner;
}

function fillCell(cell) {
  if (!canDraw()) return;
  const player = Number(cell.dataset.player);
  const i = Number(cell.dataset.index);
  if (player !== myIndex) return;
  if (localFilled[player].has(i)) return;
  localFilled[player].add(i);
  cell.classList.add('filled');
  cell.textContent = 'X';
  socket.emit('addX', { count: 1 });
}

document.addEventListener('pointerdown', e => {
  const cell = e.target.closest('.cell');
  if (!cell) return;
  dragging = true;
  fillCell(cell);
});
document.addEventListener('pointerup', () => dragging = false);
document.addEventListener('pointercancel', () => dragging = false);
document.addEventListener('pointermove', e => {
  if (!dragging) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el?.closest?.('.cell');
  if (cell) fillCell(cell);
});

function syncGridCounts(players) {
  players.forEach(p => {
    const filled = localFilled[p.index];
    while (filled.size < p.xCount) filled.add(filled.size);
    [...grids[p.index].children].forEach((cell, i) => {
      cell.classList.toggle('filled', filled.has(i));
      cell.textContent = filled.has(i) ? 'X' : '';
      cell.classList.toggle('locked', !(state && state.phase === 'draw' && myIndex === state.activePlayer && p.index === myIndex));
    });
  });
}

function pilePos(shape, idx, total) {
  const fn = shapeFns[shape] || shapeFns.spiral;
  const t = total <= 1 ? 0 : idx / total;
  let [x, y] = fn(t);
  const jitterX = Math.sin((idx + 1) * 12.9898) * 3.8;
  const jitterY = Math.cos((idx + 1) * 78.233) * 3.8;
  x = Math.max(8, Math.min(92, x + jitterX));
  y = Math.max(10, Math.min(90, y + jitterY));
  return [x, y];
}

function renderPile() {
  pileEl.innerHTML = '';
  const items = state.pile || [];
  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = `num ${item.used ? 'used' : ''}`;
    btn.textContent = item.num;
    const [x, y] = pilePos(state.shape, i, items.length - 1);
    btn.style.left = `${x}%`;
    btn.style.top = `${y}%`;
    btn.onclick = () => handleNumberClick(item, btn);
    pileEl.appendChild(btn);
  });
}

function handleNumberClick(item, btn) {
  if (!state || item.used) return;
  if (state.phase === 'choose' && myIndex === state.activePlayer) {
    socket.emit('chooseNumber', { pileId: item.id });
    return;
  }
  if (state.phase === 'draw' && myIndex !== state.activePlayer) {
    if (!ringArmed) {
      btn.classList.add('wrong');
      setTimeout(() => btn.classList.remove('wrong'), 500);
      return;
    }
    socket.emit('foundNumber', { pileId: item.id });
    ringArmed = false;
    ringBtn.classList.remove('armed');
  }
}

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
    ringArmed = false;
    ringBtn.classList.remove('armed');
  }

  syncGridCounts(state.players);
  renderPile();
  renderWinner();
}

socket.on('roomState', next => {
  state = next;
  if (!state.players.some(p => p.xCount > 0)) localFilled = [new Set(), new Set()];
  render();
});
socket.on('errorMessage', msg => {
  lobbyError.textContent = msg;
  if (state) statusEl.textContent = msg;
});

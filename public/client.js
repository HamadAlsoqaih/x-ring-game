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
  const width = Math.max(rect.width || pileEl.clientWidth || 560, 320);
  const height = Math.max(rect.height || pileEl.clientHeight || 460, 320);
  const radius = Math.max(24, Math.min(32, Math.min(width, height) / 11));
  const placed = [];
  const coords = [];

  for (let i = 0; i < total; i++) {
    const t = total <= 1 ? 0.5 : i / total;
    const [bx, by] = fn(t);
    const baseX = bx / 100 * width;
    const baseY = by / 100 * height;
    let point = null;

    const seed = i + 1;
    const maxRings = 22;
    const triesPerRing = 18;

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
      outer: for (let row = radius; row <= height - radius; row += radius * 1.6) {
        for (let col = radius; col <= width - radius; col += radius * 1.6) {
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
    btn.className = `num ${item.used ? 'used' : ''}`;
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


window.addEventListener('resize', () => {
  if (state) renderPile();
});

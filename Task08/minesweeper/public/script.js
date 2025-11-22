// DOM
const screens = {
  setup: document.getElementById('setup'),
  game: document.getElementById('game'),
  history: document.getElementById('history')
};
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');

let currentGameId = null;
let boardSize = 8;
let mineLayout = [];
let revealed = [];
let flagged = [];
let gameOver = false;

// Переключение экранов
function showScreen(id) {
  Object.values(screens).forEach(el => el.classList.remove('active'));
  screens[id].classList.add('active');
}

// === Запросы к API ===
async function api(method, url, data = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) opts.body = JSON.stringify(data);
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
  return res.json();
}

// === Новая игра ===
document.getElementById('startBtn').addEventListener('click', async () => {
  const playerName = document.getElementById('playerName').value.trim() || 'Игрок';
  boardSize = +document.getElementById('boardSize').value || 8;
  const mineCount = +document.getElementById('mineCount').value || 10;

  if (mineCount >= boardSize * boardSize) return alert('Слишком много мин!');

  // Генерация мин на клиенте (можно перенести на сервер)
  mineLayout = [];
  while (mineLayout.length < mineCount) {
    const x = Math.floor(Math.random() * boardSize);
    const y = Math.floor(Math.random() * boardSize);
    const key = `${x},${y}`;
    if (!mineLayout.includes(key)) mineLayout.push(key);
  }
  const mines = mineLayout.map(s => s.split(',').map(n => +n));

  try {
    const res = await api('POST', '/games', {
      player_name: playerName,
      board_size: boardSize,
      mine_count: mineCount,
      mine_layout: mines
    });
    currentGameId = res.id;
    initGame();
    showScreen('game');
  } catch (e) {
    alert('Ошибка старта игры: ' + e.message);
  }
});

function initGame() {
  revealed = Array(boardSize).fill().map(() => Array(boardSize).fill(false));
  flagged = Array(boardSize).fill().map(() => Array(boardSize).fill(false));
  gameOver = false;
  renderBoard();
  updateStatus('Игра началась! Кликните по ячейке.');
}

function renderBoard() {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${boardSize}, 32px)`;

  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;

      cell.addEventListener('click', () => handleCellClick(x, y));
      cell.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (!gameOver && !revealed[x][y]) {
          flagged[x][y] = !flagged[x][y];
          cell.classList.toggle('flag', flagged[x][y]);
        }
      });

      boardEl.appendChild(cell);
    }
  }
}

async function handleCellClick(x, y) {
  if (gameOver || revealed[x][y] || flagged[x][y]) return;

  revealed[x][y] = true;
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  cell.classList.add('revealed');

  // Определяем, мина ли это
  const isMine = mineLayout.includes(`${x},${y}`);
  let result;
  if (isMine) {
    result = 'mine';
    cell.classList.add('mine');
    cell.textContent = '💣';
    gameOver = true;
    updateStatus('💥 Вы подорвались! Игра окончена.');
  } else {
    // Считаем соседей
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
          if (mineLayout.includes(`${nx},${ny}`)) count++;
        }
      }
    }
    if (count > 0) {
      cell.textContent = count;
      cell.dataset.n = count;
    } else {
      // Автооткрытие
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize && !revealed[nx][ny]) {
            handleCellClick(nx, ny);
          }
        }
      }
    }
    result = 'safe';

    // Проверка победы
    const totalCells = boardSize * boardSize;
    const unrevealed = revealed.flat().filter(v => !v).length - mineLayout.length;
    if (unrevealed === 0) {
      result = 'win';
      gameOver = true;
      updateStatus('🎉 Победа! Все мины обезврежены.');
    }
  }

  // Отправляем ход на сервер
  try {
    const stepNum = document.querySelectorAll('.cell.revealed').length;
    await api('POST', `/step/${currentGameId}`, {
      step_number: stepNum,
      x: x,
      y: y,
      result: result
    });
  } catch (e) {
    console.warn('Не удалось сохранить ход:', e);
  }
}

function updateStatus(text) {
  statusEl.textContent = text;
}

// === История ===
document.getElementById('historyBtn').addEventListener('click', loadHistory);
document.getElementById('backFromHistory').addEventListener('click', () => showScreen('setup'));
document.getElementById('backBtn').addEventListener('click', () => showScreen('setup'));

async function loadHistory() {
  try {
    const games = await api('GET', '/games');
    const list = document.getElementById('gamesList');
    list.innerHTML = games.map(g => `
      <li data-id="${g.id}">
        🕒 ${new Date(g.start_time).toLocaleString()} | 
        ${g.player_name} | 
        ${g.board_size}×${g.board_size} (${g.mine_count} мин) — 
        ${g.outcome === 'win' ? '✅' : '❌'}
      </li>
    `).join('');

    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        list.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
        selectedGameId = +li.dataset.id;
        document.getElementById('replayBtn').disabled = false;
      });
    });

    showScreen('history');
  } catch (e) {
    alert('Ошибка загрузки истории: ' + e.message);
  }
}

let selectedGameId = null;
document.getElementById('replayBtn').addEventListener('click', async () => {
  if (!selectedGameId) return;

  try {
    const game = await api('GET', `/games/${selectedGameId}`);
    boardSize = game.board_size;
    mineLayout = game.mine_layout.map(([x, y]) => `${x},${y}`);

    // Имитация воспроизведения: рендерим поле и пошагово открываем
    initGame(); // сброс
    showScreen('game');
    updateStatus(`▶ Воспроизведение игры от ${new Date(game.start_time).toLocaleString()}`);

    setTimeout(() => {
      game.steps.forEach((step, i) => {
        setTimeout(() => {
          const cell = document.querySelector(`.cell[data-x="${step.x}"][data-y="${step.y}"]`);
          if (cell && !cell.classList.contains('revealed')) {
            cell.classList.add('revealed');
            if (step.result === 'mine') {
              cell.classList.add('mine');
              cell.textContent = '💣';
            } else if (step.result === 'win') {
              updateStatus('🎉 Конец записи: победа!');
            }
          }
        }, i * 500);
      });
    }, 500);
  } catch (e) {
    alert('Ошибка воспроизведения: ' + e.message);
  }
});
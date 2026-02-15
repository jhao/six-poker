let roomId = null;
let playerId = null;
let state = null;
let selected = new Set();

const $ = (id) => document.getElementById(id);

async function api(path, method = 'GET', body = null) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

$('create').onclick = async () => {
  const name = $('name').value || '玩家';
  const data = await api('/api/rooms', 'POST', { name });
  roomId = data.room_id; playerId = data.player_id;
  $('rid').value = roomId; $('pwd').value = data.password;
  $('home').classList.add('hidden'); $('room').classList.remove('hidden');
};

$('join').onclick = async () => {
  const name = $('name').value || '玩家';
  roomId = $('rid').value;
  const data = await api(`/api/rooms/${roomId}/join`, 'POST', { name, password: $('pwd').value });
  playerId = data.player_id;
  $('home').classList.add('hidden'); $('room').classList.remove('hidden');
};

$('ready').onclick = async () => {
  const me = state.players[playerId];
  await api(`/api/rooms/${roomId}/ready`, 'POST', { player_id: playerId, ready: !me.ready });
};

$('start').onclick = async () => {
  await api(`/api/rooms/${roomId}/start`, 'POST', {});
};

$('play').onclick = async () => {
  await api(`/api/rooms/${roomId}/action`, 'POST', { player_id: playerId, action: 'play', card_ids: [...selected] });
  selected.clear();
};

$('pass').onclick = async () => {
  await api(`/api/rooms/${roomId}/action`, 'POST', { player_id: playerId, action: 'pass', card_ids: [] });
};

function render() {
  if (!state) return;
  $('roomInfo').textContent = `房间 ${state.room_id} | 你的ID: ${playerId} | 状态: ${state.game_status}`;
  $('players').innerHTML = state.players.map(p =>
    `<div class="bg-slate-800 rounded p-2">${p.name} (${p.team}) ${p.ready ? '✅' : '⌛'} ${p.finished ? '🏁' : ''}</div>`).join('');

  if (state.game_status === 'playing' || state.game_status === 'round_over') {
    $('room').classList.add('hidden'); $('game').classList.remove('hidden');
  }

  const me = state.players[playerId];
  $('status').textContent = `当前轮到: ${state.players[state.turn_index]?.name || '-'}，上手: ${state.last_hand ? state.players[state.last_hand.player_id].name : '无'}`;
  $('hand').innerHTML = me.hand.map(c => {
    const checked = selected.has(c.id);
    return `<button data-id="${c.id}" class="px-2 py-1 rounded border ${checked ? 'bg-yellow-500 text-black' : 'bg-white text-black'}">${c.rank}${c.suit || ''}</button>`;
  }).join('');
  document.querySelectorAll('#hand button').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.id;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      render();
    };
  });
  $('logs').textContent = state.logs.join('\n');
}

async function tick() {
  if (!roomId || playerId === null) return;
  try {
    state = await api(`/api/rooms/${roomId}/state?player_id=${playerId}`);
    render();
  } catch (e) {
    console.error(e);
  }
}
setInterval(tick, 1000);

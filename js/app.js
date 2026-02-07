(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    document.body.classList.add('tg-theme-' + (tg.colorScheme || 'light'));
  }

  const userId = tg?.initDataUnsafe?.user?.id ?? 0;
  const username = tg?.initDataUnsafe?.user?.username ?? tg?.initDataUnsafe?.user?.first_name ?? 'Игрок';

  let state = {
    category: null,
    currentIndex: 0,
    score: 0,
    selectedAnswer: null,
    roomId: null,
    isHost: false,
    isMultiplayer: false
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => el.querySelectorAll(sel);

  let supabase = null;
  try {
    const config = window.SUPABASE_CONFIG || {};
    if (config.url && config.anonKey && window.supabase) {
      supabase = window.supabase.createClient(config.url, config.anonKey);
    }
  } catch (e) {
    console.warn('Supabase init failed', e);
  }

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#' + id);
    if (screen) screen.classList.add('active');
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // --- HOME & TABS ---
  function renderHome() {
    const container = $('#categories');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(QUIZ_DATA).forEach(([key, cat]) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'category-card';
      card.innerHTML = `<span class="cat-emoji">${cat.emoji}</span><span class="cat-name">${cat.name}</span><span class="cat-count">${cat.questions.length} вопросов</span>`;
      card.addEventListener('click', () => startQuiz(key));
      container.appendChild(card);
    });

  }

  function setupHomeTabs() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        if (tab === 'solo') $('#contentSolo')?.classList.add('active');
        else $('#contentRooms')?.classList.add('active');
      });
    });
  }

  // --- ROOM: CREATE / JOIN / PICK CATEGORY ---
  function showPickRoomCategory() {
    showScreen('pick-room-category');
    const container = $('#roomCategories');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(QUIZ_DATA).forEach(([key, cat]) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'category-card';
      card.innerHTML = `<span class="cat-emoji">${cat.emoji}</span><span class="cat-name">${cat.name}</span><span class="cat-count">${cat.questions.length} вопросов</span>`;
      card.addEventListener('click', () => createRoom(key));
      container.appendChild(card);
    });
  }

  async function createRoom(categoryKey) {
    if (!supabase) {
      alert('Комнаты не подключены. Проверь: 1) В js/supabase-config.js указаны SUPABASE_URL и SUPABASE_ANON_KEY. 2) Сделай push и дождись деплоя на Vercel. 3) Закрой Mini App в Telegram и открой заново (чтобы подгрузился новый скрипт).');
      return;
    }
    const code = generateCode();
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .insert({ code, host_id: userId, category: categoryKey, status: 'waiting' })
      .select('id')
      .single();
    if (roomErr) {
      alert('Не удалось создать комнату. Проверь Supabase.');
      return;
    }
    await supabase.from('room_players').insert({
      room_id: room.id,
      telegram_id: userId,
      username: String(username)
    });
    state.roomId = room.id;
    state.isHost = true;
    state.isMultiplayer = true;
    state.category = categoryKey;
    enterLobby(room.id, code, categoryKey);
  }

  async function joinRoom() {
    if (!supabase) {
      alert('Комнаты не подключены. Проверь: 1) В js/supabase-config.js указаны SUPABASE_URL и SUPABASE_ANON_KEY. 2) Сделай push и дождись деплоя на Vercel. 3) Закрой Mini App в Telegram и открой заново.');
      return;
    }
    const input = $('#roomCodeInput');
    const code = (input?.value || '').trim().toUpperCase();
    if (code.length < 4) {
      alert('Введи код комнаты (4–6 символов)');
      return;
    }
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('id, code, category, status')
      .eq('code', code)
      .single();
    if (roomErr || !room) {
      alert('Комната не найдена. Проверь код.');
      return;
    }
    if (room.status !== 'waiting') {
      alert('Игра уже идёт или завершена.');
      return;
    }
    const { error: joinErr } = await supabase.from('room_players').upsert({
      room_id: room.id,
      telegram_id: userId,
      username: String(username),
      score: 0
    }, { onConflict: 'room_id,telegram_id' });
    if (joinErr) {
      alert('Не удалось войти.');
      return;
    }
    state.roomId = room.id;
    state.isHost = false;
    state.isMultiplayer = true;
    state.category = room.category;
    enterLobby(room.id, room.code, room.category);
  }

  // --- LOBBY ---
  let lobbySubscriptions = [];

  function enterLobby(roomId, code, categoryKey) {
    showScreen('lobby');
    $('#roomCodeDisplay').textContent = code;
    const cat = QUIZ_DATA[categoryKey];
    $('#lobbyCategory').textContent = cat ? `${cat.emoji} ${cat.name}` : '';
    $('#startGameBtn').style.display = state.isHost ? 'block' : 'none';

    function renderPlayers(players) {
      const list = $('#playersList');
      if (!list) return;
      list.innerHTML = '';
      (players || []).forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.username || 'Игрок #' + p.telegram_id;
        if (Number(p.telegram_id) === userId) li.textContent += ' (ты)';
        list.appendChild(li);
      });
      const countEl = $('#playersCount');
      if (countEl) countEl.textContent = (players || []).length;
    }

    function renderMessages(messages) {
      const box = $('#chatMessages');
      if (!box) return;
      box.innerHTML = '';
      (messages || []).forEach(m => {
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.innerHTML = `<span class="author">${escapeHtml(m.username || 'Игрок')}:</span>${escapeHtml(m.message)}`;
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
    }

    function loadPlayers() {
      supabase.from('room_players').select('telegram_id, username').eq('room_id', roomId).then(({ data }) => renderPlayers(data));
    }
    function loadMessages() {
      supabase.from('room_messages').select('telegram_id, username, message').eq('room_id', roomId).order('created_at').then(({ data }) => renderMessages(data));
    }

    loadPlayers();
    loadMessages();

    const roomChannel = supabase.channel('room-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, (payload) => {
        const r = payload.new;
        if (r.status === 'playing') {
          unsubscribeLobby();
          state.currentIndex = 0;
          state.score = 0;
          showScreen('quiz');
          startMultiplayerQuiz();
          return;
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: 'room_id=eq.' + roomId }, () => loadPlayers())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: 'room_id=eq.' + roomId }, ({ new: m }) => {
        const box = $('#chatMessages');
        if (box) {
          const div = document.createElement('div');
          div.className = 'chat-message';
          div.innerHTML = `<span class="author">${escapeHtml(m.username || 'Игрок')}:</span>${escapeHtml(m.message)}`;
          box.appendChild(div);
          box.scrollTop = box.scrollHeight;
        }
      })
      .subscribe();
    lobbySubscriptions.push(roomChannel);
  }

  function unsubscribeLobby() {
    lobbySubscriptions.forEach(ch => supabase?.removeChannel(ch));
    lobbySubscriptions = [];
  }

  $('#copyCodeBtn')?.addEventListener('click', () => {
    const code = $('#roomCodeDisplay')?.textContent;
    if (code && navigator.clipboard) navigator.clipboard.writeText(code).then(() => alert('Код скопирован'));
  });

  $('#chatSendBtn')?.addEventListener('click', sendChatMessage);
  $('#chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

  function sendChatMessage() {
    const input = $('#chatInput');
    const text = (input?.value || '').trim();
    if (!text || !state.roomId || !supabase) return;
    supabase.from('room_messages').insert({
      room_id: state.roomId,
      telegram_id: userId,
      username: String(username),
      message: text
    }).then(() => { if (input) input.value = ''; });
  }

  $('#startGameBtn')?.addEventListener('click', async () => {
    if (!state.isHost || !state.roomId || !supabase) return;
    await supabase.from('rooms').update({ status: 'playing', current_question_index: 0 }).eq('id', state.roomId);
  });

  $('#lobbyBackBtn')?.addEventListener('click', () => {
    unsubscribeLobby();
    state.roomId = null;
    state.isMultiplayer = false;
    showScreen('home');
    renderHome();
  });

  $('#pickCategoryBackBtn')?.addEventListener('click', () => showScreen('home'));

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // --- MULTIPLAYER QUIZ ---
  let roomChannel = null;

  function startMultiplayerQuiz() {
    state.selectedAnswer = null;
    renderQuestion();
    subscribeRoom();
  }

  function subscribeRoom() {
    if (!supabase || !state.roomId) return;
    roomChannel = supabase.channel('quiz-' + state.roomId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + state.roomId }, (payload) => {
        const r = payload.new;
        state.currentIndex = r.current_question_index;
        if (r.status === 'finished') {
          supabase?.removeChannel(roomChannel);
          showScreen('room-results');
          renderLeaderboard();
          return;
        }
        renderQuestion();
      })
      .subscribe();
  }

  async function advanceRoomQuestion() {
    if (!supabase || !state.roomId) return;
    const cat = QUIZ_DATA[state.category];
    const total = cat?.questions?.length ?? 0;
    const nextIndex = state.currentIndex + 1;

    const { data: answers } = await supabase
      .from('room_answers')
      .select('telegram_id, answer_index')
      .eq('room_id', state.roomId)
      .eq('question_index', state.currentIndex);

    const correctIndex = cat?.questions?.[state.currentIndex]?.correct ?? -1;
    for (const a of answers || []) {
      if (a.answer_index === correctIndex) {
        const { data: p } = await supabase.from('room_players').select('score').eq('room_id', state.roomId).eq('telegram_id', a.telegram_id).single();
        if (p) await supabase.from('room_players').update({ score: (p.score || 0) + 1 }).eq('room_id', state.roomId).eq('telegram_id', a.telegram_id);
      }
    }
    if (nextIndex >= total) {
      await supabase.from('rooms').update({ status: 'finished', current_question_index: nextIndex }).eq('id', state.roomId);
    } else {
      await supabase.from('rooms').update({ current_question_index: nextIndex }).eq('id', state.roomId);
    }
  }

  function renderLeaderboard() {
    if (!supabase || !state.roomId) return;
    supabase.from('room_players').select('username, score').eq('room_id', state.roomId).order('score', { ascending: false }).then(({ data }) => {
      const list = $('#leaderboard');
      if (!list) return;
      list.innerHTML = '';
      (data || []).forEach((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="rank">${i + 1}.</span><span class="name">${escapeHtml(p.username || 'Игрок')}</span><span class="score">${p.score}</span>`;
        list.appendChild(li);
      });
    });
  }

  $('#roomResultsBackBtn')?.addEventListener('click', () => {
    state.roomId = null;
    state.isMultiplayer = false;
    showScreen('home');
    renderHome();
  });

  // --- SOLO QUIZ ---
  function startQuiz(categoryKey) {
    state.category = categoryKey;
    state.currentIndex = 0;
    state.score = 0;
    state.selectedAnswer = null;
    state.roomId = null;
    state.isMultiplayer = false;
    showScreen('quiz');
    $('#multiplayerStatus').textContent = '';
    renderQuestion();
  }

  function getCurrentData() {
    const cat = QUIZ_DATA[state.category];
    if (!cat) return null;
    return {
      category: cat,
      question: cat.questions[state.currentIndex],
      total: cat.questions.length
    };
  }

  function renderQuestion() {
    const data = getCurrentData();
    if (!data) {
      if (state.isMultiplayer) return;
      showScreen('home');
      return;
    }

    const { question, total } = data;
    const current = state.currentIndex + 1;

    $('#progressFill').style.width = (current / total) * 100 + '%';
    $('#questionCounter').textContent = `Вопрос ${current} из ${total}`;
    $('#questionText').textContent = question.question;

    if (state.isMultiplayer) {
      $('#multiplayerStatus').textContent = state.isHost ? 'Ведущий: нажми «Далее» после ответов' : 'Ответь на вопрос';
      $('#nextBtn').style.display = state.isHost ? 'block' : 'none';
    } else {
      $('#multiplayerStatus').textContent = '';
      $('#nextBtn').style.display = 'block';
    }

    const answersEl = $('#answers');
    answersEl.innerHTML = '';
    question.answers.forEach((text, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer-btn';
      btn.textContent = text;
      btn.dataset.index = index;
      btn.addEventListener('click', () => selectAnswer(index));
      answersEl.appendChild(btn);
    });

    $('#nextBtn').disabled = true;
    state.selectedAnswer = null;
  }

  function selectAnswer(index) {
    if (state.selectedAnswer !== null) return;
    state.selectedAnswer = index;
    const data = getCurrentData();
    if (!data) return;

    if (state.isMultiplayer && state.roomId && supabase) {
      supabase.from('room_answers').upsert({
        room_id: state.roomId,
        telegram_id: userId,
        question_index: state.currentIndex,
        answer_index: index
      }, { onConflict: 'room_id,telegram_id,question_index' });
    }

    const correct = data.question.correct;
    const buttons = $$('.answer-btn');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === correct) btn.classList.add('correct');
      else if (i === index && i !== correct) btn.classList.add('wrong');
    });

    if (!state.isMultiplayer && index === correct) state.score++;
    $('#nextBtn').disabled = state.isMultiplayer ? !state.isHost : false;
  }

  function nextQuestion() {
    const data = getCurrentData();
    if (!data) return;

    if (state.isMultiplayer) {
      advanceRoomQuestion();
      return;
    }

    if (state.currentIndex + 1 >= data.total) {
      showResults();
      return;
    }
    state.currentIndex++;
    state.selectedAnswer = null;
    renderQuestion();
  }

  function showResults() {
    const data = getCurrentData();
    if (!data) return;
    const total = data.total;
    const percent = Math.round((state.score / total) * 100);

    let title = 'Отлично!';
    let emoji = '🏆';
    if (percent < 40) { title = 'Попробуй ещё'; emoji = '💪'; }
    else if (percent < 70) { title = 'Хороший результат!'; emoji = '👍'; }

    $('#resultEmoji').textContent = emoji;
    $('#resultTitle').textContent = title;
    $('#scoreText').textContent = `Ты набрал ${state.score} из ${total}`;
    $('#scorePercent').textContent = percent + '%';

    if (tg?.sendData) {
      tg.sendData(JSON.stringify({ type: 'quiz_result', category: state.category, score: state.score, total, percent }));
    }
    showScreen('results');
  }

  function backToMenu() {
    if (roomChannel) supabase?.removeChannel(roomChannel);
    state.roomId = null;
    state.isMultiplayer = false;
    showScreen('home');
    renderHome();
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHome();
    showScreen('home');
    setupHomeTabs();

    $('#createRoomBtn')?.addEventListener('click', showPickRoomCategory);
    $('#joinRoomBtn')?.addEventListener('click', joinRoom);

    $('#nextBtn')?.addEventListener('click', nextQuestion);
    $('#playAgainBtn')?.addEventListener('click', () => startQuiz(state.category));
    $('#backToMenuBtn')?.addEventListener('click', backToMenu);
  });
})();

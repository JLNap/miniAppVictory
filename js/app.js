(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    document.body.classList.add('tg-theme-' + (tg.colorScheme || 'light'));
  }

  let state = {
    category: null,
    currentIndex: 0,
    score: 0,
    selectedAnswer: null
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => el.querySelectorAll(sel);

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#' + id);
    if (screen) screen.classList.add('active');
  }

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

  function startQuiz(categoryKey) {
    state.category = categoryKey;
    state.currentIndex = 0;
    state.score = 0;
    state.selectedAnswer = null;
    showScreen('quiz');
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
      showScreen('home');
      return;
    }

    const { question, total } = data;
    const current = state.currentIndex + 1;

    $('#progressFill').style.width = (current / total) * 100 + '%';
    $('#questionCounter').textContent = `Вопрос ${current} из ${total}`;
    $('#questionText').textContent = question.question;

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

    const correct = data.question.correct;
    const buttons = $$('.answer-btn');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === correct) btn.classList.add('correct');
      else if (i === index && i !== correct) btn.classList.add('wrong');
    });

    if (index === correct) state.score++;
    $('#nextBtn').disabled = false;
  }

  function nextQuestion() {
    const data = getCurrentData();
    if (!data) return;
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
    if (percent < 40) {
      title = 'Попробуй ещё';
      emoji = '💪';
    } else if (percent < 70) {
      title = 'Хороший результат!';
      emoji = '👍';
    }

    $('#resultEmoji').textContent = emoji;
    $('#resultTitle').textContent = title;
    $('#scoreText').textContent = `Ты набрал ${state.score} из ${total}`;
    $('#scorePercent').textContent = percent + '%';

    if (tg?.sendData) {
      tg.sendData(JSON.stringify({
        type: 'quiz_result',
        category: state.category,
        score: state.score,
        total,
        percent
      }));
    }

    showScreen('results');
  }

  function backToMenu() {
    showScreen('home');
    renderHome();
  }

  // Event listeners
  document.addEventListener('DOMContentLoaded', () => {
    renderHome();
    showScreen('home');

    $('#nextBtn')?.addEventListener('click', nextQuestion);
    $('#playAgainBtn')?.addEventListener('click', () => startQuiz(state.category));
    $('#backToMenuBtn')?.addEventListener('click', backToMenu);
  });
})();

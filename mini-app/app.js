(() => {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();

  const list = document.getElementById('match-list');
  const statusMessage = document.getElementById('status-message');
  const dateInput = document.getElementById('match-date');
  const leagueSelect = document.getElementById('league-select');
  const liveCount = document.getElementById('live-count');
  const updatedAt = document.getElementById('updated-at');
  let selectedFilter = 'all';
  let currentEvents = [];
  let refreshTimer;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function tashkentDateString(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function apiDate(value) {
    return value.replaceAll('-', '');
  }

  function formattedTime(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat('uz-UZ', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tashkent'
    }).format(date);
  }

  function isToday(value) {
    return value === tashkentDateString(new Date());
  }

  function setMessage(message = '', kind = '') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message${kind ? ` ${kind}` : ''}`;
  }

  function showLoading() {
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  }

  async function recordVisit() {
    if (!telegram?.initData) return;
    try {
      await fetch('/api/mini-app/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: telegram.initData })
      });
    } catch (error) {
      console.warn('Mini App visit could not be recorded:', error);
    }
  }

  async function loadScoreboard() {
    const date = dateInput.value;
    if (!date) return;
    setMessage();
    showLoading();
    try {
      const response = await fetch(`/api/mini-app/scoreboard?date=${encodeURIComponent(apiDate(date))}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'O‘yinlarni yuklab bo‘lmadi.');
      currentEvents = payload.events;
      updateLeagues(payload.leagues);
      renderEvents();
      updatedAt.textContent = `Yangilandi ${formattedTime(new Date().toISOString())}`;
      if (payload.partial) {
        setMessage('Ayrim musobaqalar ma’lumotini ESPN’dan olib bo‘lmadi. Ko‘rsatilgan o‘yinlar mavjud ma’lumotlardan tuzildi.', 'warning');
      }
    } catch (error) {
      list.replaceChildren();
      setMessage(error.message || 'Ulanishda xatolik. Qayta urinib ko‘ring.', 'error');
    }
  }

  function updateLeagues(leagues) {
    const selected = leagueSelect.value;
    const available = new Set(currentEvents.map((event) => event.leagueId));
    const options = ['<option value="all">Barcha musobaqalar</option>'];
    for (const league of leagues) {
      if (available.has(league.id)) {
        const option = document.createElement('option');
        option.value = league.id;
        option.textContent = league.name;
        options.push(option.outerHTML);
      }
    }
    leagueSelect.innerHTML = options.join('');
    if ([...leagueSelect.options].some((option) => option.value === selected)) {
      leagueSelect.value = selected;
    }
  }

  function teamMarkup(team, away = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `team${away ? ' away' : ''}`;
    const logo = team.logo
      ? `<img class="team-logo" src="${escapeAttribute(team.logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-placeholder',textContent:'⚽'}))">`
      : '<span class="team-placeholder">⚽</span>';
    wrapper.innerHTML = `${logo}<span class="team-name">${escapeHtml(team.name)}</span>`;
    return wrapper;
  }

  function eventMarkup(event) {
    const card = document.createElement('article');
    card.className = `match-card${event.state === 'in' ? ' live' : ''}`;
    const heading = document.createElement('div');
    heading.className = 'league-heading';
    heading.innerHTML = `<span>${escapeHtml(event.leagueName)}</span>`;
    card.append(heading);

    const meta = document.createElement('div');
    meta.className = 'match-meta';
    const stateLabel = event.state === 'in'
      ? `Jonli${event.clock ? ` · ${escapeHtml(event.clock)}` : ''}`
      : event.state === 'post'
        ? 'Yakunlandi'
        : formattedTime(event.startTime);
    meta.innerHTML = `<span>${formattedTime(event.startTime)}</span><span class="match-state${event.state === 'in' ? ' live' : ''}">${stateLabel}</span>`;
    card.append(meta);

    const teams = document.createElement('div');
    teams.className = 'teams';
    teams.append(teamMarkup(event.home));

    const score = document.createElement('div');
    score.className = `score${event.state === 'pre' ? ' scheduled' : ''}`;
    score.textContent = event.state === 'pre'
      ? 'VS'
      : `${event.home.score} : ${event.away.score}`;
    teams.append(score, teamMarkup(event.away, true));
    card.append(teams);
    if (event.venue) {
      const venue = document.createElement('div');
      venue.className = 'venue';
      venue.textContent = event.venue;
      card.append(venue);
    }
    return card;
  }

  function renderEvents() {
    const liveMatches = currentEvents.filter((event) => event.state === 'in');
    liveCount.textContent = String(liveMatches.length);
    const filteredEvents = currentEvents.filter((event) => {
      const matchesFilter = selectedFilter === 'all' || event.state === selectedFilter;
      const matchesLeague = leagueSelect.value === 'all' || event.leagueId === leagueSelect.value;
      return matchesFilter && matchesLeague;
    });

    list.replaceChildren();
    if (!filteredEvents.length) {
      const message = document.createElement('div');
      message.className = 'empty-state';
      message.innerHTML = `<div class="empty-icon">${selectedFilter === 'in' ? '🔴' : '⚽'}</div>
        <div class="empty-title">${selectedFilter === 'in' ? 'Hozircha jonli o‘yin yo‘q' : 'O‘yinlar topilmadi'}</div>
        <div>Tanlangan sana yoki musobaqada ko‘rsatiladigan o‘yin mavjud emas.</div>`;
      list.append(message);
      return;
    }

    for (const event of filteredEvents) list.append(eventMarkup(event));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function stepDate(amount) {
    const date = new Date(`${dateInput.value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    dateInput.value = localDateString(date);
    loadScoreboard();
  }

  dateInput.value = tashkentDateString(new Date());
  dateInput.addEventListener('change', loadScoreboard);
  leagueSelect.addEventListener('change', renderEvents);
  document.getElementById('previous-day').addEventListener('click', () => stepDate(-1));
  document.getElementById('next-day').addEventListener('click', () => stepDate(1));
  document.getElementById('today-button').addEventListener('click', () => {
    dateInput.value = tashkentDateString(new Date());
    loadScoreboard();
  });
  document.getElementById('refresh-button').addEventListener('click', loadScoreboard);
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedFilter = tab.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach((item) => {
        item.classList.toggle('active', item === tab);
      });
      renderEvents();
    });
  });

  recordVisit();
  loadScoreboard();
  refreshTimer = window.setInterval(() => {
    if (isToday(dateInput.value)) loadScoreboard();
  }, 60_000);
  window.addEventListener('beforeunload', () => window.clearInterval(refreshTimer));
})();

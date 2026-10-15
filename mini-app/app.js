(() => {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();
  telegram?.setHeaderColor?.('#ffffff');
  telegram?.setBackgroundColor?.('#ffffff');

  const list = document.getElementById('match-list');
  const statusMessage = document.getElementById('status-message');
  const dateInput = document.getElementById('match-date');
  const matchControls = document.getElementById('match-controls');
  const liveBanner = document.querySelector('.live-banner');
  const standingsSeason = document.getElementById('standings-season');
  const leagueSelectButton = document.getElementById('league-select-button');
  const leagueSelectLabel = document.getElementById('league-select-label');
  const leagueOptions = document.getElementById('league-options');
  const liveCount = document.getElementById('live-count');
  const updatedAt = document.getElementById('updated-at');
  let selectedFilter = 'all';
  let selectedLeague = 'all';
  let selectedView = 'matches';
  let currentLeagues = [];
  let currentEvents = [];
  let standingsRequestId = 0;
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
    if (selectedView === 'matches') {
      setMessage();
      showLoading();
    }
    try {
      const response = await fetch(`/api/mini-app/scoreboard?date=${encodeURIComponent(apiDate(date))}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'O‘yinlarni yuklab bo‘lmadi.');
      currentEvents = payload.events;
      updateLeagues(payload.leagues);
      if (selectedView === 'matches') renderEvents();
      updatedAt.textContent = `Yangilandi ${formattedTime(new Date().toISOString())}`;
      if (payload.partial && selectedView === 'matches') {
        setMessage('Ayrim musobaqalar ma’lumotini olib bo‘lmadi. Ko‘rsatilgan o‘yinlar mavjud ma’lumotlardan tuzildi.', 'warning');
      }
    } catch (error) {
      if (selectedView === 'matches') {
        list.replaceChildren();
        setMessage(error.message || 'Ulanishda xatolik. Qayta urinib ko‘ring.', 'error');
      } else {
        console.warn('Match scoreboard refresh failed:', error);
      }
    }
  }

  function updateLeagues(leagues) {
    currentLeagues = leagues;
    const choices = [{ id: 'all', name: 'Barcha musobaqalar' }, ...leagues];
    if (!choices.some((league) => league.id === selectedLeague)) selectedLeague = 'all';
    leagueOptions.replaceChildren(...choices.map((league) => {
      const option = document.createElement('button');
      option.className = 'league-option';
      option.type = 'button';
      option.id = `league-option-${league.id}`;
      option.dataset.leagueId = league.id;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(league.id === selectedLeague));
      option.tabIndex = -1;
      option.innerHTML = `<span class="league-option-mark" aria-hidden="true">${league.id === selectedLeague ? '✓' : ''}</span><span>${escapeHtml(league.name)}</span>`;
      option.addEventListener('click', () => selectLeague(league));
      return option;
    }));
    leagueSelectLabel.textContent = choices.find((league) => league.id === selectedLeague).name;
    leagueSelectButton.setAttribute('aria-activedescendant', `league-option-${selectedLeague}`);
    leagueOptions.querySelector(`[data-league-id="${selectedLeague}"]`).classList.add('selected');
    leagueSelectButton.setAttribute('aria-expanded', String(!leagueOptions.hidden));
    document.getElementById('league-filter-count').textContent = `${leagues.length} LIGA`;
  }

  function setLeagueMenuOpen(open, focusSelected = false) {
    leagueOptions.hidden = !open;
    leagueSelectButton.setAttribute('aria-expanded', String(open));
    if (open && focusSelected) {
      leagueOptions.querySelector(`[data-league-id="${selectedLeague}"]`)?.focus();
    }
  }

  function selectLeague(league) {
    selectedLeague = league.id;
    leagueSelectLabel.textContent = league.name;
    updateLeagues(currentLeagues);
    setLeagueMenuOpen(false);
    leagueSelectButton.focus();
    if (selectedView === 'standings') loadStandings();
    else renderEvents();
  }

  async function loadStandings() {
    const requestId = ++standingsRequestId;
    const league = selectedLeague;
    setMessage();
    standingsSeason.hidden = true;
    list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    const params = new URLSearchParams({ league, season: String(new Date().getFullYear()) });
    try {
      const response = await fetch(`/api/mini-app/standings?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Turnir jadvalini yuklab bo‘lmadi.');
      if (requestId !== standingsRequestId) return;
      renderStandings(payload);
      if (payload.partial) {
        setMessage(`Ayrim jadvallar yuklanmadi: ${payload.failedLeagues.join(', ')}.`, 'warning');
      }
    } catch (error) {
      if (requestId !== standingsRequestId) return;
      list.replaceChildren();
      setMessage(error.message || 'Turnir jadvalini yuklab bo‘lmadi. Qayta urinib ko‘ring.', 'error');
    }
  }

  function renderStandings(payload) {
    list.replaceChildren();
    list.classList.add('standings-list');
    const tables = payload.tables || [];
    if (!tables.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">Turnir jadvali topilmadi</div><div>Bu mavsum uchun jadval ma’lumoti hozircha mavjud emas.</div></div>';
      return;
    }

    standingsSeason.textContent = `Joriy mavsum · ${tables[0].season}`;
    standingsSeason.hidden = false;
    for (const table of tables) {
      const section = document.createElement('section');
      section.className = 'standings-card';
      const heading = document.createElement('div');
      heading.className = 'standings-heading';
      const title = document.createElement('h2');
      title.textContent = table.leagueName;
      const teamCount = document.createElement('span');
      teamCount.textContent = `${table.teams.length} JAMOA`;
      heading.append(title, teamCount);
      section.append(heading);

      if (!table.teams.length) {
        const empty = document.createElement('p');
        empty.className = 'standings-empty';
        empty.textContent = 'Hozircha o‘ynalgan uchrashuvlar yo‘q.';
        section.append(empty);
      } else {
        const standingsTable = document.createElement('table');
        standingsTable.className = 'standings-table';
        standingsTable.setAttribute('aria-label', `${table.leagueName} turnir jadvali`);
        const header = document.createElement('thead');
        header.innerHTML = '<tr><th scope="col" class="rank-column">#</th><th scope="col" class="team-column">JAMOA</th><th scope="col" class="played-column" title="O‘yinlar soni">O‘</th><th scope="col" class="wins-column" title="G‘alabalar soni">G‘</th><th scope="col" class="losses-column" title="Mag‘lubiyatlar soni">M</th><th scope="col" class="draws-column" title="Durranglar soni">D</th><th scope="col" class="goals-column" title="To‘plar nisbati: urilgan va o‘tkazilgan">T:N</th><th scope="col" class="points-column" title="Ochkolari">OCH</th></tr>';
        const body = document.createElement('tbody');
        for (const team of table.teams) {
          const row = document.createElement('tr');
          const rank = document.createElement('td');
          rank.className = 'rank-cell';
          rank.textContent = String(team.rank);
          const name = document.createElement('th');
          name.scope = 'row';
          name.className = 'team-column';
          const teamCell = document.createElement('span');
          teamCell.className = 'standing-team';
          if (team.logo) {
            const logo = document.createElement('img');
            logo.src = team.logo;
            logo.alt = '';
            logo.loading = 'lazy';
            logo.onerror = () => logo.remove();
            teamCell.append(logo);
          }
          const teamName = document.createElement('span');
          teamName.textContent = team.name;
          teamCell.append(teamName);
          name.append(teamCell);
          row.append(rank, name);
          const played = document.createElement('td');
          played.className = 'played-cell';
          played.textContent = String(team.played);
          row.append(played);
          const wins = document.createElement('td');
          wins.className = 'wins-cell';
          wins.textContent = String(team.wins);
          row.append(wins);
          const losses = document.createElement('td');
          losses.className = 'losses-cell';
          losses.textContent = String(team.losses);
          row.append(losses);
          const draws = document.createElement('td');
          draws.className = 'draws-cell';
          draws.textContent = String(team.draws);
          row.append(draws);
          const goals = document.createElement('td');
          goals.className = 'goals-cell';
          goals.textContent = `${team.goalsFor}:${team.goalsAgainst}`;
          row.append(goals);
          const points = document.createElement('td');
          points.className = 'points-cell';
          points.textContent = String(team.points);
          row.append(points);
          body.append(row);
        }
        standingsTable.append(header, body);
        section.append(standingsTable);
        const saveButton = document.createElement('button');
        saveButton.className = 'standings-image-button';
        saveButton.type = 'button';
        saveButton.textContent = '📥 Rasmni botdan yuklab olish';
        saveButton.addEventListener('click', () => sendStandingsImage(table, saveButton));
        section.append(saveButton);
      }
      list.append(section);
    }
    updatedAt.textContent = `Yangilandi ${formattedTime(new Date().toISOString())}`;
  }

  async function sendStandingsImage(table, button) {
    if (!telegram?.initData) {
      setMessage('Turnir jadvalini botdan olish uchun Mini App’ni Telegram ichida oching.', 'error');
      return;
    }

    button.disabled = true;
    button.textContent = 'Rasm tayyorlanmoqda…';
    try {
      const image = await createStandingsImage(table);
      button.textContent = 'Botga yuborilmoqda…';
      const params = new URLSearchParams({
        league: table.leagueName,
        season: table.season
      });
      const response = await fetch(`/api/mini-app/standings-image?${params}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'X-Telegram-Init-Data': telegram.initData
        },
        body: image
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Rasmni bot orqali yuborib bo‘lmadi.');
      setMessage(`${table.leagueName} jadvali bot orqali yuborildi.`, 'success');
    } catch (error) {
      setMessage(error.message || 'Jadval rasmini tayyorlab bo‘lmadi. Qayta urinib ko‘ring.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = '📥 Rasmni botdan yuklab olish';
    }
  }

  function createStandingsImage(table) {
    const canvas = document.createElement('canvas');
    const width = 1200;
    const padding = 36;
    const rowHeight = 48;
    const titleHeight = 112;
    const headerHeight = 48;
    const footerHeight = 52;
    const height = padding * 2 + titleHeight + headerHeight + table.teams.length * rowHeight + footerHeight;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Rasm tayyorlash muvaffaqiyatsiz bo‘ldi.');

    context.fillStyle = '#f4f8fd';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffffff';
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(16, 16, width - 32, height - 32, 24);
    } else {
      context.rect(16, 16, width - 32, height - 32);
    }
    context.fill();

    context.fillStyle = '#1d2b3c';
    context.font = '800 34px system-ui, sans-serif';
    context.fillText(table.leagueName, padding, padding + 38, width - padding * 2);
    context.fillStyle = '#748397';
    context.font = '500 20px system-ui, sans-serif';
    context.fillText(`${table.season} mavsumi · ${table.teams.length} jamoa`, padding, padding + 72);

    const columns = [
      { label: '#', width: 56, align: 'left' },
      { label: 'JAMOA', width: 450, align: 'left' },
      { label: 'O‘Y', width: 100 },
      { label: 'G‘', width: 86 },
      { label: 'M', width: 86 },
      { label: 'D', width: 86 },
      { label: 'T:N', width: 150 },
      { label: 'OCH', width: 100 }
    ];
    let x = padding;
    const headerY = padding + titleHeight;
    context.fillStyle = '#f0f5fb';
    context.fillRect(padding, headerY, width - padding * 2, headerHeight);
    context.font = '800 17px system-ui, sans-serif';
    context.fillStyle = '#718096';
    for (const column of columns) {
      context.textAlign = column.align || 'center';
      context.fillText(column.label, x + (column.align === 'left' ? 12 : column.width / 2), headerY + 30);
      x += column.width;
    }

    context.font = '600 18px system-ui, sans-serif';
    table.teams.forEach((team, index) => {
      const y = headerY + headerHeight + index * rowHeight;
      if (index % 2 === 1) {
        context.fillStyle = '#fafcff';
        context.fillRect(padding, y, width - padding * 2, rowHeight);
      }
      context.strokeStyle = '#edf1f6';
      context.beginPath();
      context.moveTo(padding, y + rowHeight);
      context.lineTo(width - padding, y + rowHeight);
      context.stroke();

      const values = [
        String(team.rank),
        team.name,
        String(team.played),
        String(team.wins),
        String(team.losses),
        String(team.draws),
        `${team.goalsFor}:${team.goalsAgainst}`,
        String(team.points)
      ];
      x = padding;
      values.forEach((value, columnIndex) => {
        const column = columns[columnIndex];
        context.textAlign = column.align || 'center';
        context.fillStyle = columnIndex === 0 && index === 0
          ? '#1976d2'
          : columnIndex === 1 ? '#273648' : columnIndex === 7 ? '#1765a8' : '#465466';
        context.font = columnIndex === 1 ? '700 18px system-ui, sans-serif' : '600 18px system-ui, sans-serif';
        context.fillText(value, x + (column.align === 'left' ? 12 : column.width / 2), y + 30, column.width - 16);
        x += column.width;
      });
    });

    context.textAlign = 'right';
    context.fillStyle = '#8290a1';
    context.font = '700 15px system-ui, sans-serif';
    context.fillText('FUTBOLIMIZ UZ', width - padding, height - padding - 4);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Jadval rasmini PNG formatida yaratib bo‘lmadi.'));
      }, 'image/png');
    });
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
    list.classList.remove('standings-list');
    const liveMatches = currentEvents.filter((event) => event.state === 'in');
    liveCount.textContent = String(liveMatches.length);
    const filteredEvents = currentEvents.filter((event) => {
      const matchesFilter = selectedFilter === 'all' || event.state === selectedFilter;
      const matchesLeague = selectedLeague === 'all' || event.leagueId === selectedLeague;
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
  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedView = tab.dataset.view;
      document.querySelectorAll('.view-tab').forEach((item) => {
        const active = item === tab;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      const isStandings = selectedView === 'standings';
      matchControls.hidden = isStandings;
      liveBanner.hidden = isStandings;
      if (isStandings) loadStandings();
      else {
        standingsRequestId += 1;
        standingsSeason.hidden = true;
        setMessage();
        renderEvents();
      }
    });
  });
  dateInput.addEventListener('change', loadScoreboard);
  leagueSelectButton.addEventListener('click', () => {
    const open = leagueOptions.hidden;
    setLeagueMenuOpen(open, open);
  });
  leagueOptions.addEventListener('keydown', (event) => {
    const options = [...leagueOptions.querySelectorAll('[role="option"]')];
    const currentIndex = options.indexOf(document.activeElement);
    let nextIndex;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + options.length) % options.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = options.length - 1;
    else if (event.key === 'Escape') {
      setLeagueMenuOpen(false);
      leagueSelectButton.focus();
    } else return;
    event.preventDefault();
    options[nextIndex].focus();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.league-select-wrap')) setLeagueMenuOpen(false);
  });
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

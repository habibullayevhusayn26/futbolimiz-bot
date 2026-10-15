(() => {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();
  telegram?.setHeaderColor?.('#ffffff');
  telegram?.setBackgroundColor?.('#ffffff');

  const list = document.getElementById('match-list');
  const statusMessage = document.getElementById('status-message');
  const notificationHint = document.getElementById('notification-hint');
  const dateInput = document.getElementById('match-date');
  const matchControls = document.getElementById('match-controls');
  const liveBanner = document.querySelector('.live-banner');
  const standingsSeason = document.getElementById('standings-season');
  const leagueSelectButton = document.getElementById('league-select-button');
  const leagueSelectLabel = document.getElementById('league-select-label');
  const leagueOptions = document.getElementById('league-options');
  const liveCount = document.getElementById('live-count');
  const updatedAt = document.getElementById('updated-at');
  const dashboard = document.getElementById('dashboard-view');
  const matchDetail = document.getElementById('match-detail');
  const matchDetailContent = document.getElementById('match-detail-content');
  const detailBackButton = document.getElementById('detail-back-button');
  const detailCloseButton = document.getElementById('detail-close-button');
  const detailLiveBadge = document.getElementById('detail-live-badge');
  const profileButton = document.getElementById('profile-button');
  const profileView = document.getElementById('profile-view');
  const profileContent = document.getElementById('profile-content');
  const profileBackButton = document.getElementById('profile-back-button');
  let selectedFilter = 'all';
  let selectedLeague = 'all';
  let selectedView = 'matches';
  let currentLeagues = [];
  let currentEvents = [];
  let standingsRequestId = 0;
  let refreshTimer;
  let favoriteTeamIds = new Set();
  let favoriteMatchIds = new Set();
  const requestedMatchDate = new URLSearchParams(window.location.search).get('date');
  const requestedProfile = new URLSearchParams(window.location.search).get('profile') === '1';
  let activeDetailId = null;
  let detailRequestId = 0;
  let activeDetailTab = 'lineups';
  let profileOpen = false;
  const knownTeamNames = new Map();

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

  function updateNotificationHint() {
    if (!telegram?.initData) {
      notificationHint.textContent = 'Telegram orqali ochib, klub va o‘yin yonidagi qo‘ng‘iroqni bosing — bildirishnomalar tanlovingizga qarab yuboriladi.';
      return;
    }
    const count = favoriteTeamIds.size + favoriteMatchIds.size;
    notificationHint.textContent = count
      ? `🔔 ${count} ta tanlov uchun o‘yin boshlanishi, gollar va yakuniy natija bildirishnomalari yoqilgan.`
      : '🔔 Faqat tanlaganlaringiz haqida xabar olasiz. Klub yoki o‘yin yonidagi qo‘ng‘iroqni bosib obuna bo‘ling.';
  }

  async function loadNotificationPreferences() {
    updateNotificationHint();
    if (!telegram?.initData) return;
    try {
      const response = await fetch('/api/mini-app/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', initData: telegram.initData })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Bildirishnoma sozlamalarini yuklab bo‘lmadi.');
      favoriteTeamIds = new Set(payload.favoriteTeamIds);
      favoriteMatchIds = new Set(payload.favoriteMatchIds);
      if (profileOpen) renderProfile();
      updateNotificationHint();
      if (selectedView === 'standings') loadStandings();
      else renderEvents();
    } catch (error) {
      console.error('Soccer notification preferences could not be loaded:', error);
      setMessage(error.message || 'Bildirishnoma sozlamalarini yuklab bo‘lmadi.', 'error');
    }
  }

  function notificationButton(kind, id, label) {
    if (!telegram?.initData || !id) return null;
    const enabled = (kind === 'team' ? favoriteTeamIds : favoriteMatchIds).has(id);
    const button = document.createElement('button');
    button.className = `notify-toggle${enabled ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.kind = kind;
    button.dataset.id = id;
    button.setAttribute('aria-label', `${enabled ? 'Bildirishnomani o‘chirish' : 'Bildirishnomani yoqish'}: ${label}`);
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? 'Bildirishnoma yoqilgan' : 'Bildirishnoma yoqish';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
    button.addEventListener('click', () => toggleNotificationPreference(button, kind, id, label));
    return button;
  }

  async function toggleNotificationPreference(button, kind, id, label) {
    if (!telegram?.initData || button.disabled) return;
    const selections = kind === 'team' ? favoriteTeamIds : favoriteMatchIds;
    const enabled = !selections.has(id);
    button.disabled = true;
    try {
      const response = await fetch('/api/mini-app/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', initData: telegram.initData, kind, id, enabled })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Bildirishnoma sozlamasini saqlab bo‘lmadi.');
      favoriteTeamIds = new Set(payload.favoriteTeamIds);
      favoriteMatchIds = new Set(payload.favoriteMatchIds);
      if (profileOpen) renderProfile();
      document.querySelectorAll('.notify-toggle').forEach((toggle) => {
        if (toggle.dataset.kind !== kind || toggle.dataset.id !== id) return;
        const isEnabled = selectionsFor(toggle.dataset.kind).has(id);
        toggle.classList.toggle('active', isEnabled);
        toggle.setAttribute('aria-pressed', String(isEnabled));
        toggle.setAttribute('aria-label', `${isEnabled ? 'Bildirishnomani o‘chirish' : 'Bildirishnomani yoqish'}: ${label}`);
        toggle.title = isEnabled ? 'Bildirishnoma yoqilgan' : 'Bildirishnoma yoqish';
      });
      updateNotificationHint();
      setMessage(enabled
        ? `${label} uchun bildirishnomalar yoqildi.`
        : `${label} uchun bildirishnomalar o‘chirildi.`, 'success');
    } catch (error) {
      setMessage(error.message || 'Bildirishnoma sozlamasini saqlab bo‘lmadi.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  function selectionsFor(kind) {
    return kind === 'team' ? favoriteTeamIds : favoriteMatchIds;
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
      rememberEventNames(currentEvents);
      updateLeagues(payload.leagues);
      if (selectedView === 'matches') renderEvents();
      if (activeDetailId) {
        const activeEvent = currentEvents.find((event) => event.id === activeDetailId);
        if (activeEvent) loadMatchDetails(activeEvent);
      }
      const matchIdFromUrl = new URLSearchParams(window.location.search).get('match');
      if (matchIdFromUrl && !activeDetailId) {
        const requestedEvent = currentEvents.find((event) => event.id === matchIdFromUrl);
        if (requestedEvent) openMatchDetail(requestedEvent, false);
        else setMessage('Tanlangan o‘yin ro‘yxatda topilmadi. O‘yin yakunlangan yoki hozircha yangilanmagan bo‘lishi mumkin.', 'warning');
      }
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
      for (const team of table.teams || []) knownTeamNames.set(String(team.id), team.name);
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
          const teamBell = notificationButton('team', team.id, team.name);
          if (teamBell) teamCell.append(teamBell);
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
      }
      list.append(section);
    }
    updatedAt.textContent = `Yangilandi ${formattedTime(new Date().toISOString())}`;
  }

  function teamMarkup(team, away = false) {
    const wrapper = document.createElement('div');
    wrapper.className = `team${away ? ' away' : ''}`;
    const logo = team.logo
      ? `<img class="team-logo" src="${escapeAttribute(team.logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-placeholder',textContent:'⚽'}))">`
      : '<span class="team-placeholder">⚽</span>';
    wrapper.innerHTML = `${logo}<span class="team-name">${escapeHtml(team.name)}</span>`;
    const bell = notificationButton('team', team.id, team.name);
    if (bell) wrapper.append(bell);
    return wrapper;
  }

  function eventMarkup(event) {
    const card = document.createElement('article');
    card.className = `match-card${event.state === 'in' ? ' live' : ''}`;
    card.dataset.eventId = event.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${event.home.name} — ${event.away.name}, o‘yin tafsilotlarini ochish`);
    card.addEventListener('click', (clickEvent) => {
      if (clickEvent.target.closest('button')) return;
      openMatchDetail(event);
    });
    card.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.target !== card || (keyEvent.key !== 'Enter' && keyEvent.key !== ' ')) return;
      keyEvent.preventDefault();
      openMatchDetail(event);
    });
    const heading = document.createElement('div');
    heading.className = 'league-heading match-league-heading';
    const leagueName = document.createElement('span');
    leagueName.textContent = event.leagueName;
    heading.append(leagueName);
    const matchBell = notificationButton('match', event.id, `${event.home.name} — ${event.away.name}`);
    if (matchBell) heading.append(matchBell);
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

    for (const event of filteredEvents) {
      const card = eventMarkup(event);
      list.append(card);
    }
  }

  function openMatchDetail(event, addHistoryEntry = true) {
    activeDetailId = event.id;
    activeDetailTab = 'lineups';
    dashboard.hidden = true;
    matchDetail.hidden = false;
    document.body.classList.add('detail-open');
    matchDetailContent.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    if (addHistoryEntry) {
      const url = new URL(window.location.href);
      url.searchParams.set('match', event.id);
      url.searchParams.set('league', event.leagueId);
      url.searchParams.set('date', dateInput.value);
      window.history.pushState({ matchDetail: true }, '', url);
    }
    telegram?.BackButton?.show?.();
    loadMatchDetails(event);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadMatchDetails(event) {
    const requestId = ++detailRequestId;
    try {
      const params = new URLSearchParams({ league: event.leagueId, event: event.id });
      const response = await fetch(`/api/mini-app/match-details?${params}`);
      const details = await response.json();
      if (!response.ok) throw new Error(details.error || 'O‘yin tafsilotlarini yuklab bo‘lmadi.');
      if (requestId !== detailRequestId || activeDetailId !== event.id) return;
      renderMatchDetail(event, details);
    } catch (error) {
      if (requestId !== detailRequestId || activeDetailId !== event.id) return;
      matchDetailContent.innerHTML = `<div class="detail-error">${escapeHtml(error.message || 'O‘yin tafsilotlarini yuklab bo‘lmadi.')}</div>`;
    }
  }

  function renderMatchDetail(event, details) {
    const teamLogo = (team) => team.logo
      ? `<img src="${escapeAttribute(team.logo)}" alt="" onerror="this.remove()">`
      : '<span class="detail-team-placeholder">⚽</span>';
    const score = event.state === 'pre' ? 'VS' : `${escapeHtml(event.home.score)} : ${escapeHtml(event.away.score)}`;
    const stats = details.statistics || [];
    const possession = stats.map((team) => ({
      side: team.homeAway,
      stat: team.stats.find((item) => /possession/i.test(item.name))
    }));
    const homePossession = possession.find((item) => item.side === 'home')?.stat?.value;
    const awayPossession = possession.find((item) => item.side === 'away')?.stat?.value;
    const hasPossession = homePossession !== undefined || awayPossession !== undefined;
    const homePossessionValue = formatPossession(homePossession);
    const awayPossessionValue = formatPossession(awayPossession);
    const possessionTotal = parseFloat(homePossessionValue) + parseFloat(awayPossessionValue);
    const homePossessionWidth = possessionTotal ? parseFloat(homePossessionValue) / possessionTotal * 100 : 50;
    detailLiveBadge.textContent = event.state === 'in'
      ? `${event.clock || event.status || 'JONLI'} · JONLI`
      : event.state === 'post' ? 'YAKUNLANDI' : formattedTime(event.startTime);
    detailLiveBadge.classList.toggle('live', event.state === 'in');
    matchDetailContent.innerHTML = `
      <section class="detail-hero">
        <div class="detail-league">${escapeHtml(event.leagueName)}</div>
        <div class="detail-scoreboard">
          <div class="detail-team">${teamLogo(event.home)}<strong>${escapeHtml(event.home.name)}</strong></div>
          <div class="detail-score">${score}</div>
          <div class="detail-team away">${teamLogo(event.away)}<strong>${escapeHtml(event.away.name)}</strong></div>
        </div>
        <div class="detail-venue">${escapeHtml(event.venue || '')}${event.venue ? ' · ' : ''}${escapeHtml(formattedDate(event.startTime))}</div>
      </section>
      ${hasPossession ? `<section class="detail-possession" aria-label="To‘p nazorati">
        <div><strong>TO‘P NAZORATI</strong><span>${homePossessionValue}% · ${awayPossessionValue}%</span></div>
        <div class="possession-bar"><i style="width:${homePossessionWidth}%"></i><i style="width:${100 - homePossessionWidth}%"></i></div>
      </section>` : ''}
      <nav class="detail-tabs" role="tablist" aria-label="O‘yin tafsilotlari">
        <button type="button" class="detail-tab${activeDetailTab === 'lineups' ? ' active' : ''}" role="tab" aria-selected="${activeDetailTab === 'lineups'}" data-detail-tab="lineups">Tarkiblar</button>
        <button type="button" class="detail-tab${activeDetailTab === 'events' ? ' active' : ''}" role="tab" aria-selected="${activeDetailTab === 'events'}" data-detail-tab="events">Hodisalar</button>
        <button type="button" class="detail-tab${activeDetailTab === 'statistics' ? ' active' : ''}" role="tab" aria-selected="${activeDetailTab === 'statistics'}" data-detail-tab="statistics">Statistika</button>
        <button type="button" class="detail-tab${activeDetailTab === 'goals' ? ' active' : ''}" role="tab" aria-selected="${activeDetailTab === 'goals'}" data-detail-tab="goals">⚽ Gollar</button>
      </nav>
      <section class="detail-panel${activeDetailTab === 'lineups' ? ' active' : ''}" role="tabpanel" data-detail-panel="lineups" ${activeDetailTab !== 'lineups' ? 'hidden' : ''}>
        ${renderLineups(details.lineups || [], event)}
      </section>
      <section class="detail-panel${activeDetailTab === 'events' ? ' active' : ''}" role="tabpanel" data-detail-panel="events" ${activeDetailTab !== 'events' ? 'hidden' : ''}>
        ${renderMatchTimeline(details.events || [], event)}
      </section>
      <section class="detail-panel${activeDetailTab === 'statistics' ? ' active' : ''}" role="tabpanel" data-detail-panel="statistics" ${activeDetailTab !== 'statistics' ? 'hidden' : ''}>
        ${renderMatchStatistics(stats, event)}
      </section>
      <section class="detail-panel${activeDetailTab === 'goals' ? ' active' : ''}" role="tabpanel" data-detail-panel="goals" ${activeDetailTab !== 'goals' ? 'hidden' : ''}>
        ${renderMatchTimeline((details.events || []).filter(isGoalEvent), event, 'Ushbu o‘yinda gol qayd etilmagan.')}
      </section>
    `;
  }

  function isGoalEvent(item) {
    return /goal|penalty scored|own goal/i.test(`${item.type} ${item.text}`);
  }

  function renderMatchTimeline(events, match, emptyMessage = 'O‘yin hodisalari hozircha mavjud emas.') {
    if (!events.length) return `<p class="detail-empty">${escapeHtml(emptyMessage)}</p>`;
    return `<ol class="match-timeline">${events.map((item) => {
      const side = matchEventSide(item, match);
      const clock = item.clock ? `<time>${escapeHtml(item.clock)}</time>` : '';
      const presentation = matchEventPresentation(item);
      const athletes = item.athletes?.length
        ? (presentation.kind === 'substitution'
          ? item.athletes.join(' → ')
          : presentation.kind === 'goal'
            ? item.athletes[0]
            : item.athletes.join(', '))
        : '';
      const description = `<strong>${escapeHtml(athletes || presentation.label)}</strong>${athletes ? `<span>${escapeHtml(presentation.label)}</span>` : ''}`;
      if (!side) {
        return `<li class="timeline-event neutral" title="${escapeAttribute(presentation.label)}">
          <div class="event-neutral">${clock}<span class="timeline-icon" aria-hidden="true">${presentation.icon}</span>${description}</div>
        </li>`;
      }
      return `<li class="timeline-event ${side}" title="${escapeAttribute(presentation.label)}">
        <div class="event-detail">${description}</div>
        <div class="event-marker">${clock}<span class="timeline-icon" aria-hidden="true">${presentation.icon}</span></div>
        <span class="event-spacer" aria-hidden="true"></span>
      </li>`;
    }).join('')}</ol>`;
  }

  function matchEventSide(item, match) {
    if (item.teamId && item.teamId === match.home.id) return 'home';
    if (item.teamId && item.teamId === match.away.id) return 'away';
    const text = `${item.text || ''} ${item.athletes?.join(' ') || ''}`.toLocaleLowerCase();
    const homeName = match.home.name.toLocaleLowerCase();
    const awayName = match.away.name.toLocaleLowerCase();
    if (homeName && text.includes(homeName)) return 'home';
    if (awayName && text.includes(awayName)) return 'away';
    return '';
  }

  function matchEventPresentation(item) {
    const text = `${item.type || ''} ${item.text || ''}`.toLowerCase();
    if (/own goal|o\.g\./i.test(text)) return { kind: 'goal', icon: '⚽', label: 'Avtogol' };
    if (/red card|second yellow|sent off|sending off/i.test(text)) return { kind: 'red-card', icon: '🟥', label: 'Qizil kartochka' };
    if (/yellow card/i.test(text)) return { kind: 'yellow-card', icon: '🟨', label: 'Sariq kartochka' };
    if (/substitution|substitut|player on|player off/i.test(text)) return { kind: 'substitution', icon: '🔄', label: 'Almashtirish' };
    if (/penalty.*(miss|save)|missed penalty/i.test(text)) return { kind: 'missed-penalty', icon: '❌', label: 'Penalti kiritilmadi' };
    if (/penalty/i.test(text) && /goal|scored|score/i.test(text)) return { kind: 'goal', icon: '⚽', label: 'Penaltidan gol' };
    if (/goal/i.test(text)) return { kind: 'goal', icon: '⚽', label: 'Gol' };
    if (/\bvar\b|video assistant|video review/i.test(text)) return { kind: 'var', icon: '📺', label: 'VAR tekshiruvi' };
    if (/kick.?off|first half begins/i.test(text)) return { kind: 'kickoff', icon: '▶️', label: 'O‘yin boshlandi' };
    if (/start.*(?:2nd|second).*half|second half begins/i.test(text)) return { kind: 'second-half', icon: '▶️', label: 'Ikkinchi bo‘lim boshlandi' };
    if (/match ends|end regular time|full.?time|second half ends/i.test(text)) return { kind: 'full-time', icon: '🏁', label: 'O‘yin yakunlandi' };
    if (/half.?time|halftime|half ends/i.test(text)) return { kind: 'half-time', icon: '⏸️', label: 'Tanaffus' };
    if (/extra time/i.test(text)) return { kind: 'extra-time', icon: '⏱️', label: 'Qo‘shimcha vaqt' };
    if (/offside/i.test(text)) return { kind: 'offside', icon: '🚩', label: 'O‘yindan tashqari holat' };
    if (/corner/i.test(text)) return { kind: 'corner', icon: '🚩', label: 'Burchak zarbasi' };
    if (/save|saved/i.test(text)) return { kind: 'save', icon: '🧤', label: 'Darvozabon seyv qildi' };
    if (/injur|medical|treatment/i.test(text)) return { kind: 'injury', icon: '🩹', label: 'Jarohat' };
    if (/penalty/i.test(text)) return { kind: 'penalty', icon: '⚽', label: 'Penalti' };
    return { kind: 'event', icon: '📌', label: 'Uchrashuv hodisasi' };
  }

  function formatPossession(value) {
    const number = Number.parseFloat(String(value ?? '').replace('%', ''));
    return Number.isFinite(number) ? String(number) : '0';
  }

  function formattedDate(value) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Tashkent'
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${values.day} ${values.month} ${values.year}`;
  }

  function renderLineups(lineups, match) {
    const available = lineups.filter((lineup) => lineup?.players?.length);
    if (!available.length) return '<p class="detail-empty">Tarkiblar hali e’lon qilinmagan yoki ESPN’da mavjud emas.</p>';
    const halves = ['away', 'home'].map((side) => {
      const lineup = lineups.find((item) => item?.homeAway === side);
      const team = match[side];
      if (!lineup?.players?.length) {
        return `<div class="pitch-half ${side}"><div class="pitch-team-name">${escapeHtml(team.name)}</div><p class="pitch-unavailable">Tarkib mavjud emas</p></div>`;
      }
      const starters = lineup.players.filter((player) => player.starter);
      const players = starters.length ? starters : lineup.players;
      const rows = lineupRows(players, lineup.formation);
      const orientedRows = side === 'home' ? [...rows].reverse() : rows;
      return `<div class="pitch-half ${side}">
        <div class="pitch-team-name">${escapeHtml(lineup.teamName || team.name)}${lineup.formation ? ` · ${escapeHtml(lineup.formation)}` : ''}</div>
        ${orientedRows.map((row) => `<div class="pitch-row">${row.map((player) => `<span class="pitch-player"><i>${escapeHtml(player.jersey || player.position || '•')}</i><span>${escapeHtml(player.name)}</span></span>`).join('')}</div>`).join('')}
      </div>`;
    });
    return `<div class="combined-pitch" aria-label="${escapeAttribute(`${match.away.name} va ${match.home.name} jamoalari tarkibi`)}">${halves.join('')}</div>`;
  }

  function lineupRows(players, formation) {
    players.sort((left, right) => Number(left.formationPlace || 99) - Number(right.formationPlace || 99));
    const byPosition = [
      players.filter((player) => /gk|goalkeeper/i.test(player.position)),
      players.filter((player) => /def|back/i.test(player.position)),
      players.filter((player) => /mid|cent/i.test(player.position)),
      players.filter((player) => /forw|forward|att|strik/i.test(player.position))
    ];
    const recognized = byPosition.flat();
    if (recognized.length >= Math.min(5, players.length)) {
      const remaining = players.filter((player) => !recognized.includes(player));
      return byPosition.filter((row) => row.length).map((row, index) =>
        index === byPosition.filter((item) => item.length).length - 1 ? [...row, ...remaining] : row
      );
    }
    const formationRows = String(formation || '').split('-').map(Number).filter((count) => count > 0);
    if (formationRows.length && players.length >= formationRows.reduce((sum, count) => sum + count, 0)) {
      const rows = [players.slice(0, 1)];
      let offset = 1;
      for (const count of formationRows) {
        rows.push(players.slice(offset, offset + count));
        offset += count;
      }
      if (players.length > offset) rows.push(players.slice(offset));
      return rows.filter((row) => row.length);
    }
    return [players];
  }

  function statisticLabel(value) {
    const label = String(value);
    if (/possession/i.test(label)) return 'To‘p nazorati';
    if (/accurate|completed/i.test(label) && /pass/i.test(label)) return 'Aniq paslar';
    if (/pass completion/i.test(label)) return 'Pas aniqligi';
    if (/pass/i.test(label)) return 'Paslar';
    if (/cross/i.test(label)) return /accurate/i.test(label) ? 'Aniq krosslar' : 'Krosslar';
    if (/shots? on target/i.test(label)) return 'Darvozaga aniq zarbalar';
    if (/shots?/i.test(label)) return 'Zarbalar';
    if (/corner/i.test(label)) return 'Burchak zarbalari';
    if (/foul/i.test(label)) return 'Qoidabuzarliklar';
    if (/yellow card/i.test(label)) return 'Sariq kartochkalar';
    if (/red card/i.test(label)) return 'Qizil kartochkalar';
    if (/save/i.test(label)) return 'Darvozabon seyvlar';
    if (/offside/i.test(label)) return 'Ofsaydlar';
    if (/tackle/i.test(label)) return /effective/i.test(label) ? 'To‘pni olib qo‘yish' : 'Podkatlar';
    if (/interception/i.test(label)) return 'To‘pni ushlab qolish';
    if (/clearance/i.test(label)) return 'To‘pni qaytarish';
    if (/block/i.test(label)) return 'To‘silgan zarbalar';
    if (/duel/i.test(label)) return 'Yakkakurashlar';
    if (/touch/i.test(label)) return 'To‘pga teginishlar';
    if (/dribble/i.test(label)) return 'Aldab o‘tishlar';
    if (/goal/i.test(label)) return 'Gollar';
    if (/attempt/i.test(label)) return 'Urinishlar';
    return 'Qo‘shimcha ko‘rsatkich';
  }

  function renderMatchStatistics(statistics, match) {
    const homeStats = statistics.find((item) => item.homeAway === 'home')?.stats || [];
    const awayStats = statistics.find((item) => item.homeAway === 'away')?.stats || [];
    if (!homeStats.length && !awayStats.length) return '<p class="detail-empty">O‘yin statistikasi hozircha mavjud emas.</p>';
    const stats = new Map();
    for (const stat of homeStats) stats.set(stat.name, { home: stat.value, away: '' });
    for (const stat of awayStats) {
      const values = stats.get(stat.name) || { home: '', away: '' };
      values.away = stat.value;
      stats.set(stat.name, values);
    }
    return `<div class="stats-header"><span>${escapeHtml(match.home.name)}</span><span>${escapeHtml(match.away.name)}</span></div>
      <div class="match-statistics">${[...stats].map(([name, values]) => {
        const homeNumber = Number.parseFloat(String(values.home).replace('%', '')) || 0;
        const awayNumber = Number.parseFloat(String(values.away).replace('%', '')) || 0;
        const total = homeNumber + awayNumber;
        const homeWidth = total ? Math.round(homeNumber / total * 100) : 50;
        return `<div class="match-stat"><div class="stat-values"><strong>${escapeHtml(values.home || '—')}</strong><span>${escapeHtml(statisticLabel(name))}</span><strong>${escapeHtml(values.away || '—')}</strong></div><div class="stat-bar"><i style="width:${homeWidth}%"></i><i style="width:${100 - homeWidth}%"></i></div></div>`;
      }).join('')}</div>`;
  }

  function closeMatchDetail() {
    activeDetailId = null;
    detailRequestId += 1;
    matchDetail.hidden = true;
    dashboard.hidden = false;
    document.body.classList.remove('detail-open');
    telegram?.BackButton?.hide?.();
  }

  function rememberEventNames(events) {
    for (const event of events) {
      if (event.home?.id) knownTeamNames.set(String(event.home.id), event.home.name);
      if (event.away?.id) knownTeamNames.set(String(event.away.id), event.away.name);
    }
  }

  function profileDisplayName(user) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Telegram foydalanuvchisi';
  }

  function renderProfile() {
    const user = telegram?.initDataUnsafe?.user;
    if (!user || !telegram?.initData) {
      profileContent.innerHTML = '<div class="profile-empty"><span class="profile-empty-icon">👤</span><strong>Profil ma’lumotlari mavjud emas</strong><span>Shaxsiy profil va bildirishnoma tanlovlarini ko‘rish uchun Mini App’ni Telegram ichidan oching.</span></div>';
      return;
    }

    const fullName = profileDisplayName(user);
    const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
    const avatar = user.photo_url
      ? `<img src="${escapeAttribute(user.photo_url)}" alt="" onerror="this.remove()">`
      : `<span>${escapeHtml(initials || '👤')}</span>`;
    const teams = [...favoriteTeamIds].map((id) => ({
      id,
      name: knownTeamNames.get(String(id)) || `Klub ID: ${id}`
    }));
    const matches = [...favoriteMatchIds].map((id) => {
      const event = currentEvents.find((item) => item.id === id);
      return {
        id,
        name: event ? `${event.home.name} — ${event.away.name}` : `O‘yin ID: ${id}`,
        event
      };
    });
    profileContent.innerHTML = `
      <section class="profile-card">
        <div class="profile-identity">
          <div class="profile-avatar">${avatar}</div>
          <div class="profile-name">${escapeHtml(fullName)}</div>
          ${user.username ? `<div class="profile-username">@${escapeHtml(user.username)}</div>` : ''}
        </div>
        <div class="profile-info-row"><span>Telegram ID</span><strong>${escapeHtml(user.id)}</strong></div>
        <div class="profile-info-row"><span>Til</span><strong>O‘zbekcha</strong></div>
      </section>
      <section class="profile-section">
        <div class="profile-section-heading"><h2>Sevimli klublar</h2><span>${teams.length}</span></div>
        ${teams.length ? `<ul class="profile-list">${teams.map((team) => `<li><span class="profile-list-icon">🔔</span><span>${escapeHtml(team.name)}</span></li>`).join('')}</ul>`
          : '<p class="profile-empty-list">Hozircha klub tanlanmagan.</p>'}
      </section>
      <section class="profile-section">
        <div class="profile-section-heading"><h2>Obuna bo‘lgan o‘yinlar</h2><span>${matches.length}</span></div>
        ${matches.length ? `<ul class="profile-list">${matches.map((match) => `<li><span class="profile-list-icon">⚽</span><span>${escapeHtml(match.name)}</span></li>`).join('')}</ul>`
          : '<p class="profile-empty-list">Hozircha o‘yinga obuna bo‘linmagan.</p>'}
      </section>
      <p class="profile-note">Klub yoki o‘yin bildirishnomalarini istalgan vaqtda qo‘ng‘iroqcha tugmasi orqali yoqib-o‘chirishingiz mumkin.</p>
    `;
  }

  function openProfile() {
    if (activeDetailId) return;
    profileOpen = true;
    dashboard.hidden = true;
    profileView.hidden = false;
    document.body.classList.add('profile-open');
    renderProfile();
    const url = new URL(window.location.href);
    url.searchParams.set('profile', '1');
    window.history.pushState({ profileView: true }, '', url);
    telegram?.BackButton?.show?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeProfile(updateHistory = true) {
    profileOpen = false;
    profileView.hidden = true;
    dashboard.hidden = false;
    document.body.classList.remove('profile-open');
    telegram?.BackButton?.hide?.();
    if (updateHistory) {
      const url = new URL(window.location.href);
      url.searchParams.delete('profile');
      window.history.replaceState({}, '', url);
    }
  }

  function goBackFromProfile() {
    if (window.history.state?.profileView) window.history.back();
    else closeProfile();
  }

  function goBackFromDetail() {
    if (window.history.state?.matchDetail) window.history.back();
    else {
      const url = new URL(window.location.href);
      url.searchParams.delete('match');
      url.searchParams.delete('league');
      window.history.replaceState({}, '', url);
      closeMatchDetail();
    }
  }

  matchDetailContent.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-detail-tab]');
    if (!tab) return;
    activeDetailTab = tab.dataset.detailTab;
    matchDetailContent.querySelectorAll('[data-detail-tab]').forEach((button) => {
      const active = button === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    matchDetailContent.querySelectorAll('[data-detail-panel]').forEach((panel) => {
      const active = panel.dataset.detailPanel === activeDetailTab;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
  });

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

  dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(requestedMatchDate || '')
    ? requestedMatchDate
    : tashkentDateString(new Date());
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
  profileButton.addEventListener('click', openProfile);
  profileBackButton.addEventListener('click', goBackFromProfile);
  detailBackButton.addEventListener('click', goBackFromDetail);
  detailCloseButton.addEventListener('click', goBackFromDetail);
  telegram?.BackButton?.onClick?.(() => {
    if (activeDetailId) goBackFromDetail();
    else if (profileOpen) goBackFromProfile();
  });
  window.addEventListener('popstate', () => {
    const matchId = new URLSearchParams(window.location.search).get('match');
    const isProfile = new URLSearchParams(window.location.search).get('profile') === '1';
    if (profileOpen && !isProfile) closeProfile(false);
    if (isProfile && !profileOpen) {
      profileOpen = true;
      dashboard.hidden = true;
      profileView.hidden = false;
      document.body.classList.add('profile-open');
      renderProfile();
      telegram?.BackButton?.show?.();
    }
    if (!matchId) {
      if (activeDetailId) closeMatchDetail();
      return;
    }
    const event = currentEvents.find((item) => item.id === matchId);
    if (event) openMatchDetail(event, false);
    else loadScoreboard();
  });
  document.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      selectedFilter = tab.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach((item) => {
        item.classList.toggle('active', item === tab);
      });
      renderEvents();
    });
  });

  if (requestedProfile) {
    profileOpen = true;
    dashboard.hidden = true;
    profileView.hidden = false;
    document.body.classList.add('profile-open');
    renderProfile();
  }
  recordVisit();
  loadNotificationPreferences();
  loadScoreboard();
  refreshTimer = window.setInterval(() => {
    if (isToday(dateInput.value)) loadScoreboard();
  }, 60_000);
  window.addEventListener('beforeunload', () => window.clearInterval(refreshTimer));
})();

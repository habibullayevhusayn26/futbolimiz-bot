(() => {
  const telegram = window.Telegram?.WebApp;
  telegram?.ready();
  telegram?.expand();

  const list = document.getElementById('match-list');
  const statusMessage = document.getElementById('status-message');
  const notificationHint = document.getElementById('notification-hint');
  const dateInput = document.getElementById('match-date');
  const controls = document.querySelector('.controls');
  const matchControls = document.getElementById('match-controls');
  const liveBanner = document.querySelector('.live-banner');
  const liveStreamView = document.getElementById('live-stream-view');
  const footer = document.querySelector('.footer');
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
  const profileThemeButton = document.getElementById('profile-theme-button');
  const leagueLogoUrls = {
    'uefa.champions': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
    'uefa.europa': 'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png',
    'uefa.europa.conf': 'https://a.espncdn.com/i/leaguelogos/soccer/500/20296.png',
    'eng.1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
    'esp.1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
    'fra.1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png',
    'ita.1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
    'ger.1': 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png'
  };
  let selectedFilter = 'all';
  let selectedLeague = 'all';
  let selectedView = 'matches';
  let currentLeagues = [];
  let currentEvents = [];
  let standingsRequestId = 0;
  let refreshTimer;
  let activeHlsPlayer = null;
  let liveStreamRequestId = 0;
  let currentLiveStreams = [];
  let currentLiveStream = null;
  let viewerHeartbeatTimer = null;
  let livePlayerControls = null;
  let screenWakeLock = null;
  let screenWakeLockRequest = null;
  let liveScreenWakeLockEnabled = false;
  let screenWakeLockUnsupportedWarned = false;
  let fullscreenControlsTimer = null;
  let youtubePlayerState = -1;
  let liveViewerId = '';
  let fullscreenChangeHandler = null;
  let telegramFullscreenFailureHandler = null;
  let fullscreenKeydownHandler = null;
  let favoriteTeamIds = new Set();
  let favoriteMatchIds = new Set();
  let favoriteMatchDetails = new Map();
  let themePreference = loadThemePreference();
  const requestedMatchDate = new URLSearchParams(window.location.search).get('date');
  const requestedProfile = new URLSearchParams(window.location.search).get('profile') === '1';
  let activeDetailId = null;
  let detailRequestId = 0;
  let activeDetailTab = 'lineups';
  let profileOpen = false;
  const knownTeamDetails = new Map();
  let profileTeamDetailsLoading = false;
  let profileTeamDetailsError = '';

  function loadThemePreference() {
    try {
      const saved = window.localStorage.getItem('futbolimiz-theme');
      return ['auto', 'light', 'dark'].includes(saved) ? saved : 'auto';
    } catch (error) {
      console.warn('Theme preference could not be loaded:', error);
      return 'auto';
    }
  }

  function resolvedTheme() {
    if (themePreference !== 'auto') return themePreference;
    if (telegram?.colorScheme === 'dark') return 'dark';
    if (telegram?.colorScheme === 'light') return 'light';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    telegram?.setHeaderColor?.(theme === 'dark' ? '#10151e' : '#ffffff');
    telegram?.setBackgroundColor?.(theme === 'dark' ? '#10151e' : '#ffffff');
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = theme === 'dark' ? '#10151e' : '#ffffff';
  }

  function saveThemePreference(value) {
    if (!['auto', 'light', 'dark'].includes(value)) return;
    themePreference = value;
    try {
      window.localStorage.setItem('futbolimiz-theme', value);
    } catch (error) {
      console.warn('Theme preference could not be saved:', error);
    }
    applyTheme();
  }

  function updateProfileThemeButton() {
    const themes = {
      auto: { label: 'Avto', icon: 'monitor' },
      light: { label: 'Kunduzgi', icon: 'sun' },
      dark: { label: 'Tungi', icon: 'moon' }
    };
    const theme = themes[themePreference];
    profileThemeButton.innerHTML = iconMarkup(theme.icon);
    profileThemeButton.setAttribute('aria-label', `Mavzu: ${theme.label}. Keyingisiga o‘zgartirish`);
    profileThemeButton.title = `Mavzu: ${theme.label}`;
  }

  updateProfileThemeButton();
  applyTheme();
  telegram?.onEvent?.('themeChanged', applyTheme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (themePreference === 'auto' && telegram?.colorScheme !== 'dark') applyTheme();
  });

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

  function setImageIconFallback(image, iconName, className) {
    image.addEventListener('error', () => {
      const placeholder = document.createElement('span');
      placeholder.className = className;
      placeholder.innerHTML = iconMarkup(iconName);
      image.replaceWith(placeholder);
    }, { once: true });
  }

  function iconMarkup(name, className = '') {
    return `<span class="svg-icon${className ? ` ${className}` : ''}" style="--svg-icon: url('/mini-app/icons/${name}.svg')" aria-hidden="true"></span>`;
  }

  function createLeagueLogo(leagueId, className) {
    const logoUrl = leagueLogoUrls[leagueId];
    if (!logoUrl) return null;
    const image = document.createElement('img');
    image.className = className;
    image.src = logoUrl;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.loading = 'lazy';
    image.addEventListener('error', () => image.remove(), { once: true });
    return image;
  }

  function setLeagueLabel(league) {
    leagueSelectLabel.replaceChildren();
    const logo = createLeagueLogo(league.id, 'league-inline-logo');
    if (logo) leagueSelectLabel.append(logo);
    const name = document.createElement('span');
    name.className = 'league-select-name';
    name.textContent = league.name;
    leagueSelectLabel.append(name);
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
    const message = count
      ? `${count} ta tanlov uchun o‘yin boshlanishi, gollar va yakuniy natija bildirishnomalari yoqilgan.`
      : 'Faqat tanlaganlaringiz haqida xabar olasiz. Klub yoki o‘yin yonidagi qo‘ng‘iroqni bosib obuna bo‘ling.';
    notificationHint.innerHTML = `${iconMarkup('bell', 'hint-icon')}<span>${message}</span>`;
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
      favoriteMatchDetails = new Map((payload.favoriteMatches || []).map((match) => [String(match.id), match]));
      if (profileOpen) {
        renderProfile();
        loadProfileTeamDetails();
      }
      updateNotificationHint();
      if (selectedView === 'standings') loadStandings();
      else renderEvents();
    } catch (error) {
      console.error('Soccer notification preferences could not be loaded:', error);
      setMessage(error.message || 'Bildirishnoma sozlamalarini yuklab bo‘lmadi.', 'error');
    }
  }

  function notificationButton(kind, id, label, eventDetails = null) {
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
    button.innerHTML = iconMarkup('bell');
    button.addEventListener('click', () => toggleNotificationPreference(button, kind, id, label, eventDetails));
    return button;
  }

  async function toggleNotificationPreference(button, kind, id, label, eventDetails = null) {
    if (!telegram?.initData || button.disabled) return;
    const selections = kind === 'team' ? favoriteTeamIds : favoriteMatchIds;
    const enabled = !selections.has(id);
    button.disabled = true;
    try {
      const response = await fetch('/api/mini-app/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle',
          initData: telegram.initData,
          kind,
          id,
          enabled,
          ...(kind === 'match' && enabled && eventDetails ? { eventDetails } : {})
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Bildirishnoma sozlamasini saqlab bo‘lmadi.');
      favoriteTeamIds = new Set(payload.favoriteTeamIds);
      favoriteMatchIds = new Set(payload.favoriteMatchIds);
      favoriteMatchDetails = new Map((payload.favoriteMatches || []).map((match) => [String(match.id), match]));
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
      if (profileOpen) renderProfile();
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

  function stopLiveStream() {
    liveStreamRequestId += 1;
    window.clearInterval(viewerHeartbeatTimer);
    viewerHeartbeatTimer = null;
    window.clearTimeout(fullscreenControlsTimer);
    fullscreenControlsTimer = null;
    liveScreenWakeLockEnabled = false;
    void releaseLiveScreenWakeLock();
    livePlayerControls = null;
    const telegramWebApp = window.Telegram?.WebApp;
    if (telegramWebApp?.isFullscreen &&
        telegramWebApp.exitFullscreen &&
        telegramWebApp.isVersionAtLeast?.('8.0')) {
      try {
        telegramWebApp.exitFullscreen();
      } catch (error) {
        console.warn('Telegram Mini App fullscreen could not be closed:', error);
      }
    }
    document.body.classList.remove('stream-fullscreen-open');
    if (fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
      document.removeEventListener('webkitfullscreenchange', fullscreenChangeHandler);
      window.Telegram?.WebApp?.offEvent?.('fullscreenChanged', fullscreenChangeHandler);
      fullscreenChangeHandler = null;
    }
    if (telegramFullscreenFailureHandler) {
      window.Telegram?.WebApp?.offEvent?.('fullscreenFailed', telegramFullscreenFailureHandler);
      telegramFullscreenFailureHandler = null;
    }
    if (fullscreenKeydownHandler) {
      document.removeEventListener('keydown', fullscreenKeydownHandler);
      fullscreenKeydownHandler = null;
    }
    if (activeHlsPlayer) {
      activeHlsPlayer.destroy();
      activeHlsPlayer = null;
    }
    liveStreamView.replaceChildren();
  }

  function updateLiveViewerCount(count) {
    const countElement = liveStreamView.querySelector('[data-live-viewer-count]');
    if (countElement) countElement.textContent = new Intl.NumberFormat('uz-UZ').format(count);
    liveStreamView.querySelectorAll('[data-stream-viewers]').forEach((viewerElement) => {
      const stream = currentLiveStreams.find((item) => item.id === viewerElement.dataset.streamViewers);
      if (stream) viewerElement.textContent = new Intl.NumberFormat('uz-UZ').format(stream.viewers || 0);
    });
  }

  function getLiveViewerId() {
    if (liveViewerId) return liveViewerId;
    const key = 'futbolimiz-live-viewer';
    try {
      liveViewerId = window.localStorage.getItem(key) || '';
      if (!/^[A-Za-z0-9_-]{20,80}$/.test(liveViewerId)) {
        liveViewerId = window.crypto?.randomUUID?.() ||
          Array.from(window.crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('');
        window.localStorage.setItem(key, liveViewerId);
      }
      return liveViewerId;
    } catch (error) {
      console.warn('Live viewer identity could not be stored:', error);
      liveViewerId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return liveViewerId;
    }
  }

  async function updateLiveViewerHeartbeat(streamId) {
    if (document.visibilityState === 'hidden') return;
    try {
      const response = await fetch('/api/mini-app/live-stream/viewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId: getLiveViewerId(), streamId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Tomoshabinlar sonini yangilab bo‘lmadi.');
      if (payload.streamChanged && selectedView === 'stream') {
        void loadLiveStream();
        return;
      }
      if (currentLiveStream?.id === streamId && selectedView === 'stream') {
        if (Array.isArray(payload.streams)) {
          const viewerCounts = new Map(payload.streams.map((stream) => [stream.id, stream.viewers]));
          currentLiveStreams.forEach((stream) => {
            if (viewerCounts.has(stream.id)) stream.viewers = viewerCounts.get(stream.id);
          });
        } else {
          currentLiveStream.viewers = payload.viewers;
        }
        updateLiveViewerCount(payload.viewers);
      }
    } catch (error) {
      console.warn('Live viewer count could not be refreshed:', error);
    }
  }

  function startLiveViewerHeartbeat(streamId) {
    window.clearInterval(viewerHeartbeatTimer);
    void updateLiveViewerHeartbeat(streamId);
    viewerHeartbeatTimer = window.setInterval(() => {
      void updateLiveViewerHeartbeat(streamId);
    }, 15_000);
  }

  async function requestLiveScreenWakeLock() {
    if (!liveScreenWakeLockEnabled || document.visibilityState !== 'visible' ||
        selectedView !== 'stream' || screenWakeLock) return;
    const setWakeLockMessage = (message) => {
      const status = livePlayerControls?.status;
      if (!status) return;
      status.textContent = message;
      status.dataset.wakeLockMessage = message ? 'true' : 'false';
    };
    if (!('wakeLock' in navigator)) {
      if (!screenWakeLockUnsupportedWarned) {
        console.warn('This browser does not support keeping the screen awake during a live stream.');
        screenWakeLockUnsupportedWarned = true;
      }
      setWakeLockMessage('Bu Telegram yoki brauzer ekran qulflanishini oldini olishni qo‘llab-quvvatlamaydi.');
      return;
    }
    if (screenWakeLockRequest) return screenWakeLockRequest;
    screenWakeLockRequest = navigator.wakeLock.request('screen')
      .then(async (wakeLock) => {
        if (!liveScreenWakeLockEnabled || document.visibilityState !== 'visible' || selectedView !== 'stream') {
          await wakeLock.release();
          return;
        }
        screenWakeLock = wakeLock;
        if (livePlayerControls?.status.dataset.wakeLockMessage === 'true') {
          livePlayerControls.status.textContent = '';
          livePlayerControls.status.dataset.wakeLockMessage = 'false';
        }
        wakeLock.addEventListener('release', () => {
          if (screenWakeLock !== wakeLock) return;
          screenWakeLock = null;
          void requestLiveScreenWakeLock();
        }, { once: true });
      })
      .catch((error) => {
        console.warn('Live stream screen wake lock could not be acquired:', error);
        setWakeLockMessage('Ekranni faol saqlab bo‘lmadi. Telegram sozlamalarida avtomatik qulflashni o‘chiring.');
      })
      .finally(() => {
        screenWakeLockRequest = null;
      });
    return screenWakeLockRequest;
  }

  async function releaseLiveScreenWakeLock() {
    const wakeLock = screenWakeLock;
    screenWakeLock = null;
    if (!wakeLock || wakeLock.released) return;
    try {
      await wakeLock.release();
    } catch (error) {
      console.warn('Live stream screen wake lock could not be released:', error);
    }
  }

  function renderLiveStream(stream, viewers = 0) {
    if (activeHlsPlayer) {
      activeHlsPlayer.destroy();
      activeHlsPlayer = null;
    }
    liveStreamView.replaceChildren();
    if (currentLiveStreams.length > 1) {
      const streamChoices = document.createElement('div');
      streamChoices.className = 'stream-choices';
      streamChoices.setAttribute('role', 'tablist');
      streamChoices.setAttribute('aria-label', 'Jonli efirni tanlang');
      for (const availableStream of currentLiveStreams) {
        const choice = document.createElement('button');
        choice.className = `stream-choice${availableStream.id === stream.id ? ' active' : ''}`;
        choice.type = 'button';
        choice.setAttribute('role', 'tab');
        choice.setAttribute('aria-selected', String(availableStream.id === stream.id));
        choice.dataset.streamId = availableStream.id;
        const choiceTitle = document.createElement('span');
        choiceTitle.className = 'stream-choice-title';
        choiceTitle.textContent = availableStream.title || 'Jonli efir';
        const choiceViewers = document.createElement('span');
        choiceViewers.className = 'stream-choice-viewers';
        choiceViewers.dataset.streamViewers = availableStream.id;
        choiceViewers.textContent = new Intl.NumberFormat('uz-UZ').format(availableStream.viewers || 0);
        choice.append(choiceTitle, choiceViewers);
        choice.addEventListener('click', () => {
          const url = new URL(window.location.href);
          url.searchParams.set('stream', 'live');
          url.searchParams.set('streamId', availableStream.id);
          window.history.pushState({ liveStream: true }, '', url);
          void loadLiveStream();
        });
        streamChoices.append(choice);
      }
      liveStreamView.append(streamChoices);
    }
    const heading = document.createElement('h1');
    heading.className = 'stream-heading';
    heading.textContent = stream?.title || 'Jonli efir';
    const headingRow = document.createElement('div');
    headingRow.className = 'stream-heading-row';
    headingRow.append(heading);
    if (stream) {
      const viewerBadge = document.createElement('span');
      viewerBadge.className = 'stream-viewer-count';
      viewerBadge.innerHTML = `${iconMarkup('user-round')} <span data-live-viewer-count>${new Intl.NumberFormat('uz-UZ').format(viewers)}</span> tomoshabin`;
      headingRow.append(viewerBadge);
    }
    liveStreamView.append(headingRow);

    if (!stream) {
      const empty = document.createElement('div');
      empty.className = 'stream-empty';
      empty.innerHTML = `<div class="empty-icon">${iconMarkup('tv')}</div>
        <div class="empty-title">Hozircha jonli efir yo‘q</div>
        <div>Efir boshlanganda shu yerda tomosha qilishingiz mumkin.</div>`;
      liveStreamView.append(empty);
      return;
    }

    const player = document.createElement('div');
    player.className = 'stream-player';
    player.setAttribute('aria-label', 'Futbolimiz jonli efir pleeri');
    const stage = document.createElement('div');
    stage.className = 'stream-stage';
    const status = document.createElement('p');
    status.className = 'stream-player-status';
    status.setAttribute('role', 'status');
    function setPlayerMessage(message) {
      status.textContent = message;
    }
    let video = null;
    let frame = null;
    if (stream.type === 'youtube') {
      frame = document.createElement('iframe');
      const embedUrl = new URL(stream.embedUrl);
      embedUrl.searchParams.set('controls', '0');
      embedUrl.searchParams.set('enablejsapi', '1');
      embedUrl.searchParams.set('playsinline', '1');
      embedUrl.searchParams.set('fs', '1');
      embedUrl.searchParams.set('rel', '0');
      embedUrl.searchParams.set('origin', window.location.origin);
      frame.src = embedUrl.toString();
      frame.title = 'Futbol jonli efiri';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.loading = 'lazy';
      frame.addEventListener('load', () => {
        frame.contentWindow?.postMessage(JSON.stringify({
          event: 'command',
          func: 'addEventListener',
          args: ['onStateChange']
        }), 'https://www.youtube-nocookie.com');
      });
      stage.append(frame);
    } else if (stream.type === 'hls') {
      video = document.createElement('video');
      video.playsInline = true;
      video.preload = 'none';
      video.volume = 0.8;
      video.setAttribute('aria-label', 'Jonli futbol efiri');
      stage.append(video);
      const HlsPlayer = window.Hls;
      if (HlsPlayer?.isSupported()) {
        const hls = new HlsPlayer();
        activeHlsPlayer = hls;
        hls.loadSource(stream.url);
        hls.attachMedia(video);
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          console.error('HLS live stream playback failed:', data.type, data.details);
          setPlayerMessage('Efirni ijro etib bo‘lmadi. Keyinroq qayta urinib ko‘ring.');
          hls.destroy();
          if (activeHlsPlayer === hls) activeHlsPlayer = null;
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = stream.url;
      } else {
        setPlayerMessage('Bu qurilmada HLS efirini ijro etib bo‘lmaydi.');
      }
    } else {
      const error = document.createElement('p');
      error.className = 'stream-error';
      error.textContent = 'Efir manzili noto‘g‘ri sozlangan.';
      liveStreamView.append(error);
      return;
    }

    const controls = document.createElement('div');
    controls.className = 'stream-controls';
    const fullscreenTouchLayer = document.createElement('div');
    fullscreenTouchLayer.className = 'stream-fullscreen-touch-layer';
    fullscreenTouchLayer.setAttribute('aria-hidden', 'true');
    const playButton = document.createElement('button');
    playButton.className = 'stream-control-button stream-play-button';
    playButton.type = 'button';
    playButton.setAttribute('aria-label', 'Efirni boshlash');
    const soundButton = document.createElement('button');
    soundButton.className = 'stream-control-button stream-sound-button';
    soundButton.type = 'button';
    soundButton.setAttribute('aria-label', 'Ovozni o‘chirish');
    soundButton.innerHTML = iconMarkup('volume-2');
    const volume = document.createElement('input');
    volume.className = 'stream-volume';
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.value = '80';
    volume.setAttribute('aria-label', 'Efir ovozi');
    const fullscreenButton = document.createElement('button');
    fullscreenButton.className = 'stream-control-button stream-fullscreen-button';
    fullscreenButton.type = 'button';
    fullscreenButton.setAttribute('aria-label', 'Katta ekranda ko‘rish');
    fullscreenButton.innerHTML = iconMarkup('maximize');
    if (stream.type === 'youtube') volume.hidden = true;
    controls.append(playButton, soundButton, volume, fullscreenButton);
    player.append(stage, controls, fullscreenTouchLayer);
    livePlayerControls = { playButton, soundButton, volume, fullscreenButton, video, frame, player, status };

    const updatePlayButton = (playing) => {
      playButton.innerHTML = iconMarkup(playing ? 'pause' : 'play');
      playButton.setAttribute('aria-label', playing ? 'Efirni pauza qilish' : 'Efirni boshlash');
    };
    updatePlayButton(false);
    playButton.addEventListener('click', () => {
      liveScreenWakeLockEnabled = true;
      void requestLiveScreenWakeLock();
      if (video) {
        if (video.paused) {
          video.play().catch((error) => {
            console.warn('Live stream playback could not start:', error);
            setPlayerMessage('Efirni boshlash uchun qayta bosing.');
          });
        } else video.pause();
      } else {
        const playing = youtubePlayerState === 1;
        frame.contentWindow?.postMessage(JSON.stringify({
          event: 'command',
          func: playing ? 'pauseVideo' : 'playVideo',
          args: ''
        }), 'https://www.youtube-nocookie.com');
        updatePlayButton(!playing);
      }
    });
    if (video) {
      video.addEventListener('play', () => updatePlayButton(true));
      video.addEventListener('pause', () => updatePlayButton(false));
      video.addEventListener('volumechange', () => {
        volume.value = String(Math.round(video.volume * 100));
        soundButton.innerHTML = iconMarkup(video.muted || video.volume === 0 ? 'volume-x' : 'volume-2');
        soundButton.setAttribute('aria-label', video.muted ? 'Ovozni yoqish' : 'Ovozni o‘chirish');
      });
      volume.addEventListener('input', () => {
        video.volume = Number(volume.value) / 100;
        video.muted = video.volume === 0;
      });
      soundButton.addEventListener('click', () => {
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0) video.volume = 0.8;
      });
    } else {
      soundButton.addEventListener('click', () => {
        const muted = soundButton.dataset.muted === 'true';
        frame.contentWindow?.postMessage(JSON.stringify({
          event: 'command',
          func: muted ? 'unMute' : 'mute',
          args: ''
        }), 'https://www.youtube-nocookie.com');
        soundButton.dataset.muted = String(!muted);
        soundButton.innerHTML = iconMarkup(muted ? 'volume-2' : 'volume-x');
        soundButton.setAttribute('aria-label', muted ? 'Ovozni o‘chirish' : 'Ovozni yoqish');
      });
    }
    const updateFullscreenState = (fullscreen) => {
      player.classList.toggle('is-fullscreen', fullscreen);
      document.body.classList.toggle('stream-fullscreen-open', fullscreen);
      fullscreenButton.innerHTML = iconMarkup(fullscreen ? 'minimize' : 'maximize');
      fullscreenButton.setAttribute('aria-label', fullscreen ? 'Katta ekran rejimidan chiqish' : 'Katta ekranda ko‘rish');
      window.clearTimeout(fullscreenControlsTimer);
      fullscreenControlsTimer = null;
      if (fullscreen) {
        player.classList.remove('stream-controls-hidden');
        fullscreenControlsTimer = window.setTimeout(() => {
          player.classList.add('stream-controls-hidden');
        }, 5_000);
      } else {
        player.classList.remove('stream-controls-hidden');
      }
    };
    const showFullscreenControls = () => {
      if (!player.classList.contains('is-fullscreen')) return;
      player.classList.remove('stream-controls-hidden');
      window.clearTimeout(fullscreenControlsTimer);
      fullscreenControlsTimer = window.setTimeout(() => {
        player.classList.add('stream-controls-hidden');
      }, 5_000);
    };
    player.addEventListener('pointermove', showFullscreenControls);
    player.addEventListener('pointerdown', showFullscreenControls);
    player.addEventListener('keydown', showFullscreenControls);
    fullscreenTouchLayer.addEventListener('pointerdown', showFullscreenControls);
    fullscreenButton.addEventListener('click', async () => {
      liveScreenWakeLockEnabled = true;
      void requestLiveScreenWakeLock();
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      const telegramWebApp = window.Telegram?.WebApp;
      const isFullscreen = fullscreenElement === player || telegramWebApp?.isFullscreen || player.classList.contains('is-fullscreen');
      try {
        if (isFullscreen) {
          if (telegramWebApp?.isFullscreen &&
              telegramWebApp.exitFullscreen &&
              telegramWebApp.isVersionAtLeast?.('8.0')) {
            telegramWebApp.exitFullscreen();
            updateFullscreenState(false);
          } else if (document.fullscreenElement === player) {
            await document.exitFullscreen();
          } else if (document.webkitFullscreenElement === player && document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          } else {
            updateFullscreenState(false);
          }
        } else if (telegramWebApp?.requestFullscreen && telegramWebApp.isVersionAtLeast?.('8.0')) {
          telegramWebApp.requestFullscreen();
          updateFullscreenState(true);
        } else if (player.requestFullscreen) {
          await player.requestFullscreen();
          updateFullscreenState(true);
        } else if (player.webkitRequestFullscreen) {
          player.webkitRequestFullscreen();
          updateFullscreenState(true);
        } else {
          updateFullscreenState(true);
        }
      } catch (error) {
        console.warn('Live stream fullscreen could not be opened:', error);
        updateFullscreenState(true);
      }
    });
    fullscreenChangeHandler = () => {
      const fullscreen = document.fullscreenElement === player ||
        document.webkitFullscreenElement === player ||
        window.Telegram?.WebApp?.isFullscreen === true;
      updateFullscreenState(fullscreen);
    };
    document.addEventListener('fullscreenchange', fullscreenChangeHandler);
    document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
    if (window.Telegram?.WebApp?.onEvent &&
        window.Telegram.WebApp.isVersionAtLeast?.('8.0')) {
      window.Telegram.WebApp.onEvent('fullscreenChanged', fullscreenChangeHandler);
      telegramFullscreenFailureHandler = () => {
        console.warn('Telegram Mini App fullscreen could not be opened.');
        updateFullscreenState(true);
      };
      window.Telegram.WebApp.onEvent('fullscreenFailed', telegramFullscreenFailureHandler);
    }
    fullscreenKeydownHandler = (event) => {
      if (event.key === 'Escape' && player.classList.contains('is-fullscreen') &&
          document.fullscreenElement !== player && document.webkitFullscreenElement !== player) {
        updateFullscreenState(false);
      }
    };
    document.addEventListener('keydown', fullscreenKeydownHandler);
    player.append(status);
    liveStreamView.append(player);
    if (stream.match) {
      const matchInfo = document.createElement('p');
      matchInfo.className = 'stream-match-info';
      matchInfo.textContent = `${stream.match.leagueName || ''}${stream.match.leagueName ? ' · ' : ''}${stream.match.homeName} — ${stream.match.awayName}`;
      liveStreamView.append(matchInfo);
    }
    startLiveViewerHeartbeat(stream.id);
    void requestLiveScreenWakeLock();
  }

  async function loadLiveStream({ play = true } = {}) {
    if (play) stopLiveStream();
    const requestId = ++liveStreamRequestId;
    if (play) {
      const loading = document.createElement('div');
      loading.className = 'skeleton';
      liveStreamView.append(loading);
    }
    try {
      const response = await fetch('/api/mini-app/live-stream', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Jonli efirni yuklab bo‘lmadi.');
      if (requestId !== liveStreamRequestId) return;
      currentLiveStreams = Array.isArray(payload.streams)
        ? payload.streams
        : payload.stream
          ? [{ ...payload.stream, viewers: payload.viewers || 0 }]
          : [];
      const requestedStreamId = new URLSearchParams(window.location.search).get('streamId');
      currentLiveStream = currentLiveStreams.find((stream) => stream.id === requestedStreamId) ||
        currentLiveStreams.find((stream) => stream.id === currentLiveStream?.id) ||
        currentLiveStreams[0] ||
        null;
      if (selectedView === 'matches') renderEvents();
      if (play && selectedView === 'stream') {
        renderLiveStream(
          currentLiveStream,
          currentLiveStream?.viewers ?? payload.viewers ?? 0
        );
      }
    } catch (error) {
      if (requestId !== liveStreamRequestId) return;
      if (!play || selectedView !== 'stream') {
        console.error('Live stream details could not be loaded:', error);
        return;
      }
      liveStreamView.replaceChildren();
      const message = document.createElement('p');
      message.className = 'stream-error';
      message.textContent = error.message || 'Jonli efirni yuklab bo‘lmadi. Qayta urinib ko‘ring.';
      liveStreamView.append(message);
    }
  }

  window.addEventListener('message', (event) => {
    if (!livePlayerControls?.frame ||
        event.source !== livePlayerControls.frame.contentWindow ||
        !['https://www.youtube-nocookie.com', 'https://www.youtube.com'].includes(event.origin)) return;
    let payload;
    try {
      payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    const state = payload?.info?.playerState ?? payload?.info;
    if (payload?.event === 'onStateChange' || payload?.event === 'infoDelivery') {
      youtubePlayerState = Number(state);
      livePlayerControls.playButton.innerHTML = iconMarkup(youtubePlayerState === 1 ? 'pause' : 'play');
      livePlayerControls.playButton.setAttribute('aria-label', youtubePlayerState === 1 ? 'Efirni pauza qilish' : 'Efirni boshlash');
      if (youtubePlayerState === 1) {
        liveScreenWakeLockEnabled = true;
        void requestLiveScreenWakeLock();
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && selectedView === 'stream' && currentLiveStream) {
      liveScreenWakeLockEnabled = true;
      void requestLiveScreenWakeLock();
      void updateLiveViewerHeartbeat(currentLiveStream.id);
    }
  });

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
      option.innerHTML = `<span class="league-option-mark">${league.id === selectedLeague ? iconMarkup('check') : ''}</span>`;
      const logo = createLeagueLogo(league.id, 'league-option-logo');
      if (logo) option.append(logo);
      const name = document.createElement('span');
      name.className = 'league-option-name';
      name.textContent = league.name;
      option.append(name);
      option.addEventListener('click', () => selectLeague(league));
      return option;
    }));
    setLeagueLabel(choices.find((league) => league.id === selectedLeague));
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
    setLeagueLabel(league);
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
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">${iconMarkup('trophy')}</div><div class="empty-title">Turnir jadvali topilmadi</div><div>Bu mavsum uchun jadval ma’lumoti hozircha mavjud emas.</div></div>`;
      return;
    }

    standingsSeason.textContent = `Joriy mavsum · ${tables[0].season}`;
    standingsSeason.hidden = false;
    for (const table of tables) {
      for (const team of table.teams || []) rememberTeamDetails(team);
      const section = document.createElement('section');
      section.className = 'standings-card';
      const heading = document.createElement('div');
      heading.className = 'standings-heading';
      const title = document.createElement('h2');
      const logo = createLeagueLogo(table.leagueId, 'league-heading-logo');
      if (logo) title.append(logo);
      const leagueName = document.createElement('span');
      leagueName.textContent = table.leagueName;
      title.append(leagueName);
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
      ? `<img class="team-logo" src="${escapeAttribute(team.logo)}" alt="" loading="lazy">`
      : `<span class="team-placeholder">${iconMarkup('ball-football')}</span>`;
    wrapper.innerHTML = `${logo}<span class="team-name">${escapeHtml(team.name)}</span>`;
    const logoImage = wrapper.querySelector('.team-logo');
    if (logoImage) setImageIconFallback(logoImage, 'ball-football', 'team-placeholder');
    const bell = notificationButton('team', team.id, team.name);
    if (bell) wrapper.append(bell);
    return wrapper;
  }

  function eventMarkup(event) {
    const card = document.createElement('article');
    const matchStream = currentLiveStreams.find((stream) =>
      stream.match?.id === String(event.id) && stream.match.leagueId === event.leagueId
    );
    const hasLiveStream = Boolean(matchStream);
    card.className = `match-card${event.state === 'in' ? ' live' : ''}`;
    if (hasLiveStream) card.classList.add('broadcast-live');
    card.dataset.eventId = event.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `${event.home.name} — ${event.away.name}, ${hasLiveStream ? 'jonli efirni ochish' : 'o‘yin tafsilotlarini ochish'}`);
    card.addEventListener('click', (clickEvent) => {
      if (clickEvent.target.closest('button')) return;
      if (hasLiveStream) openLiveStream(matchStream.id);
      else openMatchDetail(event);
    });
    card.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.target !== card || (keyEvent.key !== 'Enter' && keyEvent.key !== ' ')) return;
      keyEvent.preventDefault();
      if (hasLiveStream) openLiveStream(matchStream.id);
      else openMatchDetail(event);
    });
    const heading = document.createElement('div');
    heading.className = 'league-heading match-league-heading';
    const leagueName = document.createElement('span');
    const logo = createLeagueLogo(event.leagueId, 'match-league-logo');
    if (logo) heading.append(logo);
    leagueName.textContent = event.leagueName;
    heading.append(leagueName);
    const matchBell = notificationButton('match', event.id, `${event.home.name} — ${event.away.name}`, {
      id: String(event.id),
      homeName: event.home.name,
      awayName: event.away.name,
      leagueName: event.leagueName
    });
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
    if (hasLiveStream) {
      const liveTag = document.createElement('span');
      liveTag.className = 'match-stream-tag';
      liveTag.innerHTML = `${iconMarkup('play')} <span>EFIRDA · KO‘RISH</span>`;
      meta.append(liveTag);
    }
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

  function openLiveStream(streamId, addHistoryEntry = true) {
    if (addHistoryEntry) {
      const url = new URL(window.location.href);
      url.searchParams.set('stream', 'live');
      if (streamId) url.searchParams.set('streamId', streamId);
      else url.searchParams.delete('streamId');
      url.searchParams.delete('match');
      url.searchParams.delete('league');
      window.history.pushState({ liveStream: true }, '', url);
    }
    selectView('stream');
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
      message.innerHTML = `<div class="empty-icon">${iconMarkup(selectedFilter === 'in' ? 'circle-dot' : 'ball-football')}</div>
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
      : `<span class="detail-team-placeholder">${iconMarkup('ball-football')}</span>`;
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
        <div class="detail-league">${leagueLogoUrls[event.leagueId] ? `<img class="detail-league-logo" src="${escapeAttribute(leagueLogoUrls[event.leagueId])}" alt="" aria-hidden="true">` : ''}<span>${escapeHtml(event.leagueName)}</span></div>
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
        <button type="button" class="detail-tab${activeDetailTab === 'goals' ? ' active' : ''}" role="tab" aria-selected="${activeDetailTab === 'goals'}" data-detail-tab="goals">${iconMarkup('ball-football')} Gollar</button>
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
          <div class="event-neutral">${clock}${iconMarkup(presentation.icon, `timeline-icon event-icon-${presentation.kind}`)}${description}</div>
        </li>`;
      }
      return `<li class="timeline-event ${side}" title="${escapeAttribute(presentation.label)}">
        <div class="event-detail">${description}</div>
        <div class="event-marker">${clock}${iconMarkup(presentation.icon, `timeline-icon event-icon-${presentation.kind}`)}</div>
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
    if (/own goal|o\.g\./i.test(text)) return { kind: 'goal', icon: 'ball-football', label: 'Avtogol' };
    if (/red card|second yellow|sent off|sending off/i.test(text)) return { kind: 'red-card', icon: 'square', label: 'Qizil kartochka' };
    if (/yellow card/i.test(text)) return { kind: 'yellow-card', icon: 'square', label: 'Sariq kartochka' };
    if (/substitution|substitut|player on|player off/i.test(text)) return { kind: 'substitution', icon: 'repeat-2', label: 'Almashtirish' };
    if (/penalty.*(miss|save)|missed penalty/i.test(text)) return { kind: 'missed-penalty', icon: 'circle-x', label: 'Penalti kiritilmadi' };
    if (/penalty/i.test(text) && /goal|scored|score/i.test(text)) return { kind: 'goal', icon: 'ball-football', label: 'Penaltidan gol' };
    if (/goal/i.test(text)) return { kind: 'goal', icon: 'ball-football', label: 'Gol' };
    if (/\bvar\b|video assistant|video review/i.test(text)) return { kind: 'var', icon: 'tv', label: 'VAR tekshiruvi' };
    if (/kick.?off|first half begins/i.test(text)) return { kind: 'kickoff', icon: 'play', label: 'O‘yin boshlandi' };
    if (/start.*(?:2nd|second).*half|second half begins/i.test(text)) return { kind: 'second-half', icon: 'play', label: 'Ikkinchi bo‘lim boshlandi' };
    if (/match ends|end regular time|full.?time|second half ends/i.test(text)) return { kind: 'full-time', icon: 'flag', label: 'O‘yin yakunlandi' };
    if (/half.?time|halftime|half ends/i.test(text)) return { kind: 'half-time', icon: 'pause', label: 'Tanaffus' };
    if (/extra time/i.test(text)) return { kind: 'extra-time', icon: 'timer', label: 'Qo‘shimcha vaqt' };
    if (/offside/i.test(text)) return { kind: 'offside', icon: 'flag', label: 'O‘yindan tashqari holat' };
    if (/corner/i.test(text)) return { kind: 'corner', icon: 'flag', label: 'Burchak zarbasi' };
    if (/save|saved/i.test(text)) return { kind: 'save', icon: 'shield-check', label: 'Darvozabon seyv qildi' };
    if (/injur|medical|treatment/i.test(text)) return { kind: 'injury', icon: 'bandage', label: 'Jarohat' };
    if (/penalty/i.test(text)) return { kind: 'penalty', icon: 'ball-football', label: 'Penalti' };
    return { kind: 'event', icon: 'pin', label: 'Uchrashuv hodisasi' };
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
      if (event.home?.id) rememberTeamDetails(event.home);
      if (event.away?.id) rememberTeamDetails(event.away);
    }
  }

  function rememberTeamDetails(team) {
    const id = String(team.id || '');
    if (!id) return;
    const existing = knownTeamDetails.get(id) || {};
    knownTeamDetails.set(id, {
      name: team.name || existing.name || '',
      logo: team.logo || existing.logo || ''
    });
  }

  async function loadProfileTeamDetails() {
    if (profileTeamDetailsLoading || !favoriteTeamIds.size ||
        [...favoriteTeamIds].every((id) => knownTeamDetails.get(String(id))?.name)) return;
    profileTeamDetailsLoading = true;
    profileTeamDetailsError = '';
    renderProfile();
    try {
      const params = new URLSearchParams({
        league: 'all',
        season: String(new Date().getFullYear())
      });
      const response = await fetch(`/api/mini-app/standings?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Klub ma’lumotlarini yuklab bo‘lmadi.');
      for (const table of payload.tables || []) {
        for (const team of table.teams || []) rememberTeamDetails(team);
      }
      if (payload.partial) {
        profileTeamDetailsError = `Ayrim ligalar klublari yuklanmadi: ${payload.failedLeagues.join(', ')}.`;
      }
      renderProfile();
    } catch (error) {
      profileTeamDetailsError = error.message || 'Klub nomlari va logotiplarini yuklab bo‘lmadi.';
      console.error('Profile team details could not be loaded:', error);
      renderProfile();
    } finally {
      profileTeamDetailsLoading = false;
    }
  }

  function profileDisplayName(user) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Telegram foydalanuvchisi';
  }

  function profileIdentityHash(user) {
    const identity = String(user.id || user.username || profileDisplayName(user));
    return Array.from(identity).reduce(
      (value, character) => (value * 31 + character.codePointAt(0)) >>> 0,
      7
    );
  }

  function profilePattern(user) {
    const patternIndex = profileIdentityHash(user) % 20;
    const avatarOrnaments = Array.from({ length: 14 }, (_, index) => {
      const angle = (patternIndex * 13 + index * (360 / 14) + ((patternIndex + index * 3) % 5 - 2) * 2) * Math.PI / 180;
      const radius = 39 + ((patternIndex * 7 + index * 3) % 5) * 1.5;
      const x = 60 + Math.cos(angle) * radius;
      const y = 60 + Math.sin(angle) * radius;
      const size = 0.62 + ((patternIndex * 7 + index * 3) % 5) * 0.07;
      const rotation = (patternIndex * 23 + index * 41) % 360;
      const opacity = 0.14 + ((patternIndex + index) % 4) * 0.025;
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rotation}) scale(${size}) translate(-12 -12)" opacity="${opacity}"><path d="M12 20C11 14 6 10 2 9c1 6 5 10 10 11Zm0-2c1-7 5-11 10-13-1 7-5 12-10 13Zm0 1c-1-7-1-12 1-17 4 6 4 11-1 17Zm-1 0h2v4h-2z"/></g>`;
    }).join('');
    const backgroundOrnaments = Array.from({ length: 24 }, (_, index) => {
      const cell = (index * 7 + patternIndex) % 24;
      const column = cell % 6;
      const row = Math.floor(cell / 6);
      const x = 8 + column * 50 + ((patternIndex * 11 + index * 17) % 15);
      const y = 7 + row * 36 + ((patternIndex * 19 + index * 23) % 12);
      const size = 0.4 + ((patternIndex + index * 3) % 5) * 0.055;
      const rotation = (patternIndex * 17 + index * 53) % 360;
      const opacity = 0.08 + ((patternIndex + index) % 4) * 0.018;
      return `<g transform="translate(${x} ${y}) rotate(${rotation}) scale(${size})" opacity="${opacity}"><path d="M12 20C11 14 6 10 2 9c1 6 5 10 10 11Zm0-2c1-7 5-11 10-13-1 7-5 12-10 13Zm0 1c-1-7-1-12 1-17 4 6 4 11-1 17Zm-1 0h2v4h-2z"/></g>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="#fff">${avatarOrnaments}</svg>`;
    const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" fill="#fff">${backgroundOrnaments}</svg>`;
    const hue = (118 + patternIndex * 47) % 360;
    const background = `linear-gradient(125deg, hsl(${hue} 30% 36%), hsl(${hue} 34% 45%) 52%, hsl(${hue} 32% 33%))`;
    return {
      index: patternIndex,
      image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(backgroundSvg)}")`,
      background
    };
  }

  function renderProfile() {
    const user = telegram?.initDataUnsafe?.user;
    if (!user || !telegram?.initData) {
      profileContent.innerHTML = `<div class="profile-empty"><span class="profile-empty-icon">${iconMarkup('user-round')}</span><strong>Profil ma’lumotlari mavjud emas</strong><span>Shaxsiy profil va bildirishnoma tanlovlarini ko‘rish uchun Mini App’ni Telegram ichidan oching.</span></div>`;
      return;
    }

    const fullName = profileDisplayName(user);
    const pattern = profilePattern(user);
    const initials = fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase();
    const avatar = user.photo_url
      ? `<img src="${escapeAttribute(user.photo_url)}" alt="" onerror="this.remove()">`
      : `<span>${escapeHtml(initials || '')}</span>`;
    const teams = [...favoriteTeamIds].map((id) => {
      const details = knownTeamDetails.get(String(id)) || {};
      return {
        id: String(id),
        name: details.name || 'Klub nomi topilmadi',
        logo: details.logo || `https://a.espncdn.com/i/teamlogos/soccer/500/${encodeURIComponent(id)}.png`
      };
    });
    const matches = [...favoriteMatchIds].map((id) => {
      const event = currentEvents.find((item) => item.id === id);
      const savedDetails = favoriteMatchDetails.get(String(id));
      return {
        id,
        name: event
          ? `${event.home.name} — ${event.away.name}`
          : savedDetails
            ? `${savedDetails.homeName} — ${savedDetails.awayName}`
            : 'O‘yin jamoalari ma’lumoti mavjud emas',
        event
      };
    });
    profileContent.innerHTML = `
      <section class="profile-card">
        <div class="profile-banner" style="--profile-background: ${pattern.background}; --profile-background-pattern: ${escapeAttribute(pattern.backgroundImage)}">
          <div class="profile-identity">
            <div class="profile-avatar-wrap" data-profile-pattern="${pattern.index}" style="--profile-pattern: ${escapeAttribute(pattern.image)}">
              <div class="profile-avatar">${avatar}</div>
            </div>
            <div class="profile-name">${escapeHtml(fullName)}</div>
            ${user.username ? `<div class="profile-username">@${escapeHtml(user.username)}</div>` : ''}
          </div>
        </div>
        <div class="profile-info-row"><span>Telegram ID</span><strong>${escapeHtml(user.id)}</strong></div>
        <div class="profile-info-row"><span>Til</span><strong>O‘zbekcha</strong></div>
      </section>
      <section class="profile-section">
        <div class="profile-section-heading"><h2>Sevimli klublar</h2><span>${teams.length}</span></div>
        ${teams.length ? `<ul class="profile-list">${teams.map((team) => `<li class="profile-team-item" data-profile-team-id="${escapeAttribute(team.id)}">
          <img class="profile-team-logo" src="${escapeAttribute(team.logo)}" alt="" data-fallback-icon="ball-football">
          <span class="profile-team-name">${escapeHtml(team.name)}</span>
          <span class="profile-team-action" data-id="${escapeAttribute(team.id)}"></span>
        </li>`).join('')}</ul>`
          : '<p class="profile-empty-list">Hozircha klub tanlanmagan.</p>'}
        ${profileTeamDetailsLoading ? '<p class="profile-data-message">Klub nomlari yuklanmoqda…</p>' : ''}
        ${profileTeamDetailsError ? `<p class="profile-data-message error">${escapeHtml(profileTeamDetailsError)}</p>` : ''}
      </section>
      <section class="profile-section">
        <div class="profile-section-heading"><h2>Obuna bo‘lgan o‘yinlar</h2><span>${matches.length}</span></div>
        ${matches.length ? `<ul class="profile-list">${matches.map((match) => `<li><span class="profile-list-icon">${iconMarkup('ball-football')}</span><span>${escapeHtml(match.name)}</span></li>`).join('')}</ul>`
          : '<p class="profile-empty-list">Hozircha o‘yinga obuna bo‘linmagan.</p>'}
      </section>
      <p class="profile-note">Klub yoki o‘yin bildirishnomalarini istalgan vaqtda qo‘ng‘iroqcha tugmasi orqali yoqib-o‘chirishingiz mumkin.</p>
    `;
    profileContent.querySelectorAll('.profile-team-action').forEach((placeholder) => {
      const team = teams.find((item) => item.id === placeholder.dataset.id);
      const button = notificationButton('team', team.id, team.name);
      if (button) {
        button.classList.add('profile-team-toggle');
        placeholder.replaceWith(button);
      } else {
        placeholder.remove();
      }
    });
    profileContent.querySelectorAll('img[data-fallback-icon="ball-football"]').forEach((image) =>
      setImageIconFallback(image, 'ball-football', 'profile-team-placeholder')
    );
    updateProfileThemeButton();
  }

  function openProfile() {
    if (activeDetailId) return;
    if (selectedView === 'stream') stopLiveStream();
    profileOpen = true;
    dashboard.hidden = true;
    profileView.hidden = false;
    document.body.classList.add('profile-open');
    renderProfile();
    loadProfileTeamDetails();
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
    if (selectedView === 'stream') loadLiveStream();
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

  const requestedLiveStream = new URLSearchParams(window.location.search).get('stream') === 'live';
  dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(requestedMatchDate || '')
    ? requestedMatchDate
    : tashkentDateString(new Date());
  function selectView(view) {
    selectedView = view;
    document.querySelectorAll('.view-tab').forEach((tab) => {
      const active = tab.dataset.view === selectedView;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    const isMatches = selectedView === 'matches';
    const isStandings = selectedView === 'standings';
    const isStream = selectedView === 'stream';
    matchControls.hidden = !isMatches;
    liveBanner.hidden = isStandings || isStream;
    notificationHint.hidden = isStream;
    statusMessage.hidden = isStream;
    controls.hidden = isStream;
    standingsSeason.hidden = !isStandings;
    list.hidden = isStream;
    liveStreamView.hidden = !isStream;
    footer.hidden = isStream;
    if (isStandings) {
      liveScreenWakeLockEnabled = false;
      stopLiveStream();
      loadStandings();
    } else if (isStream) {
      standingsRequestId += 1;
      setMessage();
      loadLiveStream();
    } else {
      stopLiveStream();
      standingsRequestId += 1;
      standingsSeason.hidden = true;
      setMessage();
      renderEvents();
    }
  }
  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.view !== 'stream') {
        const url = new URL(window.location.href);
        if (url.searchParams.has('stream')) {
          url.searchParams.delete('stream');
          window.history.replaceState({}, '', url);
        }
      }
      selectView(tab.dataset.view);
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
  document.getElementById('refresh-button').addEventListener('click', () => {
    if (selectedView === 'stream') loadLiveStream();
    else if (selectedView === 'standings') loadStandings();
    else loadScoreboard();
  });
  profileButton.addEventListener('click', openProfile);
  profileBackButton.addEventListener('click', goBackFromProfile);
  profileThemeButton.addEventListener('click', () => {
    const themes = ['auto', 'light', 'dark'];
    const nextTheme = themes[(themes.indexOf(themePreference) + 1) % themes.length];
    saveThemePreference(nextTheme);
    updateProfileThemeButton();
  });
  detailBackButton.addEventListener('click', goBackFromDetail);
  detailCloseButton.addEventListener('click', goBackFromDetail);
  telegram?.BackButton?.onClick?.(() => {
    if (activeDetailId) goBackFromDetail();
    else if (profileOpen) goBackFromProfile();
  });
  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('match');
    const isProfile = params.get('profile') === '1';
    if (params.get('stream') === 'live') {
      if (selectedView !== 'stream') selectView('stream');
      else if (params.get('streamId') !== currentLiveStream?.id) void loadLiveStream();
    } else if (selectedView === 'stream') {
      selectView('matches');
    }
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
  if (requestedLiveStream) selectView('stream');
  else loadLiveStream({ play: false });
  refreshTimer = window.setInterval(() => {
    if (isToday(dateInput.value)) loadScoreboard();
  }, 60_000);
  window.addEventListener('beforeunload', () => {
    window.clearInterval(refreshTimer);
    stopLiveStream();
  });
})();

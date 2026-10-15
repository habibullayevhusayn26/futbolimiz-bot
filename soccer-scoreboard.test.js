const assert = require('node:assert/strict');
const test = require('node:test');
const {
  app,
  fetchSoccerMatchDetails,
  fetchSoccerScoreboard,
  fetchSoccerStandings,
  findSoccerMatchesStartingWithin,
  getActiveLiveViewerCount,
  getMiniAppLiveStreamUrl,
  getMatchMiniAppUrl,
  getMiniAppUrl,
  findNextScheduledSoccerMatch,
  getSoccerMatchNotificationPhase,
  isSubscribedToSoccerMatch,
  isValidScoreboardDate,
  recordLiveStreamViewer,
  normalizeSoccerLiveStream,
  normalizeSoccerEvent,
  normalizeSoccerMatchDetails,
  normalizeSoccerStandings,
  soccerLeagues
} = require('./bot');

test('accepts real calendar dates in ESPN scoreboard format only', () => {
  assert.equal(isValidScoreboardDate('20261015'), true);
  assert.equal(isValidScoreboardDate('20260229'), false);
  assert.equal(isValidScoreboardDate('2026-10-15'), false);
});

test('normalizes ESPN soccer event data for the Mini App', () => {
  const event = normalizeSoccerEvent({
    id: 'match-1',
    date: '2026-10-15T17:00:00Z',
    competitions: [{
      date: '2026-10-15T17:00:00Z',
      status: {
        displayClock: '55:00',
        type: { state: 'in', shortDetail: '2nd Half' }
      },
      competitors: [
        { homeAway: 'home', score: '2', team: { id: 'home-id', displayName: 'Home FC', logo: 'https://example.com/home.png' } },
        { homeAway: 'away', score: '1', team: { id: 'away-id', displayName: 'Away FC', logo: 'https://example.com/away.png' } }
      ]
    }]
  }, { id: 'eng.1', name: 'Premier League' });

  assert.deepEqual(event, {
    id: 'match-1',
    leagueId: 'eng.1',
    leagueName: 'Premier League',
    startTime: '2026-10-15T17:00:00Z',
    state: 'in',
    status: '2nd Half',
    clock: '55:00',
    home: { id: 'home-id', name: 'Home FC', logo: 'https://example.com/home.png', score: '2' },
    away: { id: 'away-id', name: 'Away FC', logo: 'https://example.com/away.png', score: '1' },
    venue: ''
  });
  assert.equal(normalizeSoccerEvent({ competitions: [] }, { id: 'eng.1', name: 'Premier League' }), null);
});

test('accepts HTTPS YouTube embeds and HLS sources for the live stream', () => {
  assert.deepEqual(normalizeSoccerLiveStream('https://youtu.be/abcdefghijk'), {
    type: 'youtube',
    url: 'https://youtu.be/abcdefghijk',
    embedUrl: 'https://www.youtube-nocookie.com/embed/abcdefghijk'
  });
  assert.deepEqual(normalizeSoccerLiveStream('https://www.youtube.com/live/abcdefghijk'), {
    type: 'youtube',
    url: 'https://www.youtube.com/live/abcdefghijk',
    embedUrl: 'https://www.youtube-nocookie.com/embed/abcdefghijk'
  });
  assert.deepEqual(normalizeSoccerLiveStream('https://media.example.com/live.m3u8?token=secret'), {
    type: 'hls',
    url: 'https://media.example.com/live.m3u8?token=secret'
  });
  assert.equal(normalizeSoccerLiveStream('http://media.example.com/live.m3u8'), null);
  assert.equal(normalizeSoccerLiveStream('https://user:password@media.example.com/live.m3u8'), null);
  assert.equal(normalizeSoccerLiveStream('https://youtube.com.example.com/live/abcdefghijk'), null);
  assert.equal(normalizeSoccerLiveStream('https://www.youtube.com/watch?v=short'), null);
  assert.equal(normalizeSoccerLiveStream('https://media.example.com/live.mp4'), null);
});

test('selects only scheduled matches within the next 30 minutes in kickoff order', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const events = [
    { id: 'later', state: 'pre', startTime: '2026-10-15T12:25:00Z' },
    { id: 'in-progress', state: 'in', startTime: '2026-10-15T12:05:00Z' },
    { id: 'too-late', state: 'pre', startTime: '2026-10-15T12:31:00Z' },
    { id: 'first', state: 'pre', startTime: '2026-10-15T12:00:00Z' }
  ];
  assert.deepEqual(findSoccerMatchesStartingWithin(events, now).map((event) => event.id), ['first', 'later']);
});

test('counts live viewers once per identity and expires inactive viewers', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const streamId = 'live-stream-test-0001';
  const firstViewerId = 'viewer-identity-first-0001';
  const secondViewerId = 'viewer-identity-second-0002';
  assert.equal(recordLiveStreamViewer(firstViewerId, streamId, now), 1);
  assert.equal(recordLiveStreamViewer(firstViewerId, streamId, now + 5_000), 1);
  assert.equal(recordLiveStreamViewer(secondViewerId, streamId, now + 6_000), 2);
  assert.equal(getActiveLiveViewerCount(streamId, now + 51_000), 1);
  assert.equal(getActiveLiveViewerCount(streamId, now + 52_000), 0);
});

test('normalizes match events, lineups, and team statistics from ESPN summary data', () => {
  const details = normalizeSoccerMatchDetails({
    plays: [{
      clock: { displayValue: '23′' },
      type: { text: 'Goal' },
      text: 'Player A scores',
      team: { id: 'home-id' },
      participants: [{ athlete: { displayName: 'Player A' } }]
    }],
    rosters: [{
      homeAway: 'home',
      formation: '4-3-3',
      team: { displayName: 'Home FC' },
      roster: [{
        starter: true,
        formationPlace: '11',
        jersey: '9',
        position: { abbreviation: 'F' },
        athlete: {
          displayName: 'Player A',
        }
      }]
    }],
    boxscore: {
      teams: [{
        homeAway: 'home',
        team: { displayName: 'Home FC' },
        statistics: [
          { name: 'possessionPct', label: 'Possession', displayValue: '58%' },
          { name: 'totalGoals', label: 'Total Goals', displayValue: '15' }
        ]
      }]
    }
  });

  assert.deepEqual(details, {
    events: [{
      clock: '23′',
      type: 'Goal',
      text: 'Player A scores',
      teamId: 'home-id',
      athletes: ['Player A']
    }],
    lineups: [{
      homeAway: 'home',
      teamName: 'Home FC',
      formation: '4-3-3',
      players: [{ name: 'Player A', position: 'F', jersey: '9', formationPlace: '11', starter: true }]
    }],
    statistics: [{
      homeAway: 'home',
      teamName: 'Home FC',
      stats: [{ name: 'Possession', value: '58%' }]
    }]
  });
});

test('normalizes historic ESPN summaries with nested key events and lineup entries', () => {
  const details = normalizeSoccerMatchDetails({
    keyEvents: [
      {
        time: { displayValue: "18'" },
        text: 'Home FC scores',
        play: {
          type: { text: 'Goal' },
          text: 'Player A scores',
          team: { id: 'home-id' }
        }
      },
      {
        time: { displayValue: "22'" },
        text: 'The attack continues',
        play: { type: { text: 'Commentary' }, text: 'The attack continues.' }
      }
    ],
    rosters: [{
      homeAway: 'home',
      team: { displayName: 'Home FC' },
      roster: [{
        starter: true,
        jersey: '1',
        formationPlace: '1',
        position: { displayName: 'Goalkeeper' },
        athlete: { displayName: 'Keeper' }
      }]
    }],
    boxscore: {
      teams: [{
        homeAway: 'home',
        team: { displayName: 'Home FC' },
        statistics: [{ name: 'possessionPct', label: 'Possession', displayValue: '56.5' }]
      }]
    }
  });

  assert.deepEqual(details.events, [{
    clock: "18'",
    type: 'Goal',
    text: 'Player A scores',
    teamId: 'home-id',
    athletes: []
  }]);
  assert.deepEqual(details.lineups[0].players[0], {
    name: 'Keeper',
    position: 'Goalkeeper',
    jersey: '1',
    formationPlace: '1',
    starter: true
  });
  assert.deepEqual(details.statistics[0].stats[0], { name: 'Possession', value: '56.5' });
});

test('fetches and caches match details from the selected ESPN competition', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        boxscore: {
          teams: [{
            homeAway: 'home',
            team: { displayName: 'Home FC' },
            statistics: [{ name: 'possessionPct', label: 'Possession', displayValue: '55%' }]
          }]
        }
      })
    };
  };
  const [first, second] = await Promise.all([
    fetchSoccerMatchDetails('eng.1', 'details-test-1', fakeFetch),
    fetchSoccerMatchDetails('eng.1', 'details-test-1', fakeFetch)
  ]);

  assert.deepEqual(first, second);
  assert.equal(first.statistics[0].stats[0].value, '55%');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/eng\.1\/summary\?event=details-test-1/);
});

test('includes only the six requested competitions', () => {
  assert.deepEqual(soccerLeagues.map((league) => league.name), [
    'UEFA Chempionlar Ligasi',
    'Angliya Premyer Ligasi',
    'LaLiga',
    'Ligue 1',
    'A Seriya',
    'Bundesliga'
  ]);
});

test('loads only selected competitions from ESPN and caches the scoreboard', async () => {
  const date = '20261015';
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    const isPremierLeague = String(url).includes('/eng.1/scoreboard');
    return {
      ok: true,
      json: async () => ({
        events: isPremierLeague ? [{
          id: 'pl-1',
          date: '2026-10-15T17:00:00Z',
          competitions: [{
            date: '2026-10-15T17:00:00Z',
            status: { type: { state: 'pre', description: 'Scheduled' } },
            competitors: [
              { homeAway: 'home', score: '0', team: { displayName: 'Home FC' } },
              { homeAway: 'away', score: '0', team: { displayName: 'Away FC' } }
            ]
          }]
        }] : []
      })
    };
  };

  const [first, second] = await Promise.all([
    fetchSoccerScoreboard(date, fakeFetch),
    fetchSoccerScoreboard(date, fakeFetch)
  ]);

  assert.equal(first, second);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].leagueName, 'Angliya Premyer Ligasi');
  assert.equal(first.partial, false);
  assert.equal(calls.length, soccerLeagues.length);
  assert.ok(calls.every((url) => url.includes(`dates=${date}`)));
  assert.ok(calls.every((url) => url.includes('espn.com')));
  assert.equal(await fetchSoccerScoreboard(date, fakeFetch), first);
  assert.equal(calls.length, soccerLeagues.length);
});

test('calculates a current-season league table and excludes unrelated fixtures', () => {
  const makeEvent = (id, date, homeId, awayId, homeScore, awayScore, slug = 'premier-league', state = 'post') => ({
    id,
    date,
    season: { slug },
    competitions: [{
      status: { type: { state } },
      competitors: [
        { id: homeId, homeAway: 'home', score: String(homeScore), team: { id: homeId, displayName: `Team ${homeId}` } },
        { id: awayId, homeAway: 'away', score: String(awayScore), team: { id: awayId, displayName: `Team ${awayId}` } }
      ]
    }]
  });
  const events = [
    makeEvent('old', '2026-05-30T12:00:00Z', 'a', 'b', 4, 0),
    makeEvent('win', '2026-08-01T12:00:00Z', 'a', 'b', 2, 0),
    makeEvent('draw', '2026-08-08T12:00:00Z', 'a', 'c', 1, 1),
    makeEvent('future', '2026-08-15T12:00:00Z', 'b', 'a', 0, 0, 'premier-league', 'pre')
  ];
  const table = normalizeSoccerStandings(events, soccerLeagues[1], {
    startDate: '2026-06-01T00:00:00Z',
    displayName: '2026-27 Angliya Premyer Ligasi'
  });

  assert.equal(table.teams.length, 3);
  assert.deepEqual(table.teams.map(({ name, played, points, goalDifference }) => ({
    name, played, points, goalDifference
  })), [
    { name: 'Team a', played: 2, points: 4, goalDifference: 2 },
    { name: 'Team b', played: 1, points: 0, goalDifference: -2 },
    { name: 'Team c', played: 1, points: 1, goalDifference: 0 }
  ].sort((left, right) =>
    right.points - left.points ||
    right.goalDifference - left.goalDifference ||
    left.name.localeCompare(right.name)
  ));
  assert.equal(table.teams[0].form.join(''), 'WD');
});

test('only counts Champions League league-phase games in its table', () => {
  const event = (id, slug) => ({
    id,
    date: '2026-09-10T12:00:00Z',
    season: { slug },
    competitions: [{
      status: { type: { state: 'post' } },
      competitors: [
        { id: 'a', homeAway: 'home', score: '2', team: { id: 'a', displayName: 'Team A' } },
        { id: 'b', homeAway: 'away', score: '0', team: { id: 'b', displayName: 'Team B' } }
      ]
    }]
  });
  const table = normalizeSoccerStandings(
    [event('qualifier', 'qualification'), event('league-phase', 'league-phase')],
    soccerLeagues[0],
    { startDate: '2026-07-01T00:00:00Z', displayName: '2026-27 UEFA Champions League' }
  );
  assert.equal(table.teams.length, 2);
  assert.equal(table.teams[0].played, 1);
});

test('fetches and caches current-season tables for all selected leagues', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        leagues: [{ season: { year: 2088, startDate: '2088-06-01T00:00:00Z', displayName: '2088-89' } }],
        events: []
      })
    };
  };
  const [first, second] = await Promise.all([
    fetchSoccerStandings('all', 2088, fakeFetch),
    fetchSoccerStandings('all', 2088, fakeFetch)
  ]);

  assert.equal(first.tables.length, 6);
  assert.equal(first.partial, false);
  assert.equal(calls.length, soccerLeagues.length);
  assert.ok(calls.every((url) => url.includes('dates=2088') && url.includes('limit=1000')));
  assert.deepEqual(second, first);
  await fetchSoccerStandings('eng.1', 2088, fakeFetch);
  assert.equal(calls.length, soccerLeagues.length);
});

test('serves the embedded Mini App and its scoreboard API', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(`${baseUrl}/mini-app/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /class="brand-logo"/);
  assert.match(html, /alt="Futbolimiz UZ logotipi"/);
  assert.match(html, /id="profile-button"/);
  assert.match(html, /id="profile-view"/);
  assert.match(html, /id="notification-hint"/);
  assert.match(html, /data-view="stream"/);
  assert.match(html, /id="live-stream-view"/);
  assert.match(html, /rel="icon" type="image\/png" href="\/mini-app\/logo\.png"/);

  const logo = await fetch(`${baseUrl}/mini-app/logo.png`);
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type'), /image\/png/);

  const iconNames = [
    'bandage', 'ball-football', 'bell', 'calendar-days', 'check', 'chevron-down',
    'chevron-left', 'chevron-right', 'circle-dot', 'circle-x', 'flag', 'goal',
    'moon', 'monitor', 'pause', 'pin', 'play', 'refresh-cw', 'repeat-2',
    'shield-check', 'square', 'sun', 'timer', 'trophy', 'tv', 'user-round', 'x'
  ];
  const icons = await Promise.all(iconNames.map((name) => fetch(`${baseUrl}/mini-app/icons/${name}.svg`)));
  for (const icon of icons) {
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await icon.text(), /<svg\b/);
  }

  const styles = await fetch(`${baseUrl}/mini-app/styles.css`);
  assert.equal(styles.status, 200);
  assert.match(await styles.text(), /mask-image:\s*var\(--svg-icon\)/);

  const invalidDate = await fetch(`${baseUrl}/api/mini-app/scoreboard?date=20260230`);
  assert.equal(invalidDate.status, 400);
  const invalidLeague = await fetch(`${baseUrl}/api/mini-app/standings?league=uzb.1`);
  assert.equal(invalidLeague.status, 400);
  const invalidDetailsLeague = await fetch(`${baseUrl}/api/mini-app/match-details?league=uzb.1&event=123`);
  assert.equal(invalidDetailsLeague.status, 400);
  const invalidDetailsEvent = await fetch(`${baseUrl}/api/mini-app/match-details?league=eng.1&event=not%20valid`);
  assert.equal(invalidDetailsEvent.status, 400);
  const liveStreamResponse = await fetch(`${baseUrl}/api/mini-app/live-stream`);
  assert.equal(liveStreamResponse.status, 200);
  assert.equal(liveStreamResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await liveStreamResponse.json(), { stream: null, viewers: 0 });
  const invalidViewer = await fetch(`${baseUrl}/api/mini-app/live-stream/viewer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ viewerId: 'bad', streamId: 'bad' })
  });
  assert.equal(invalidViewer.status, 400);
  const inactiveStreamViewer = await fetch(`${baseUrl}/api/mini-app/live-stream/viewer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      viewerId: 'viewer-identity-for-test-0001',
      streamId: 'stream-identity-for-test-0001'
    })
  });
  assert.equal(inactiveStreamViewer.status, 200);
  assert.deepEqual(await inactiveStreamViewer.json(), { viewers: 0, streamChanged: true });
  const unauthenticatedPreferences = await fetch(`${baseUrl}/api/mini-app/notification-preferences`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'get' })
  });
  assert.equal(unauthenticatedPreferences.status, 401);
});

test('uses the configured public origin with the embedded app path', () => {
  assert.match(getMiniAppUrl(), /^https:\/\/.+\/mini-app\/$/);
});

test('creates a Mini App link that directly opens the live stream', () => {
  const url = new URL(getMiniAppLiveStreamUrl());
  assert.equal(url.pathname, '/mini-app/');
  assert.equal(url.searchParams.get('stream'), 'live');
});

test('creates a Mini App link targeting the requested match and Tashkent date', () => {
  const url = new URL(getMatchMiniAppUrl({
    id: 'match-123',
    leagueId: 'eng.1',
    startTime: '2026-10-15T19:30:00Z'
  }));

  assert.equal(url.pathname, '/mini-app/');
  assert.equal(url.searchParams.get('match'), 'match-123');
  assert.equal(url.searchParams.get('league'), 'eng.1');
  assert.equal(url.searchParams.get('date'), '2026-10-16');
});

test('selects the nearest upcoming scheduled match for a private notification test', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const upcoming = {
    id: 'next-match',
    state: 'pre',
    startTime: '2026-10-16T12:00:00Z'
  };
  const later = {
    id: 'later-match',
    state: 'pre',
    startTime: '2026-10-16T15:00:00Z'
  };

  assert.equal(findNextScheduledSoccerMatch([
    { id: 'live-match', state: 'in', startTime: '2026-10-15T12:30:00Z' },
    later,
    { id: 'past-match', state: 'pre', startTime: '2026-10-15T11:00:00Z' },
    upcoming
  ], now), upcoming);
  assert.equal(findNextScheduledSoccerMatch([], now), null);
});

test('sends match notifications only to users following either club or the match', () => {
  const event = {
    id: 'match-123',
    home: { id: 'home-id' },
    away: { id: 'away-id' }
  };

  assert.equal(isSubscribedToSoccerMatch({
    favoriteSoccerTeamIds: ['home-id'],
    favoriteSoccerMatchIds: []
  }, event), true);
  assert.equal(isSubscribedToSoccerMatch({
    favoriteSoccerTeamIds: [],
    favoriteSoccerMatchIds: ['match-123']
  }, event), true);
  assert.equal(isSubscribedToSoccerMatch({
    favoriteSoccerTeamIds: [],
    favoriteSoccerMatchIds: []
  }, event), false);
});

test('detects kick-off, score changes, and final results without duplicate notifications', () => {
  const pre = { state: 'pre', homeScore: '0', awayScore: '0' };
  const live = { state: 'in', home: { score: '0' }, away: { score: '0' } };
  const previousLive = { state: 'in', homeScore: '0', awayScore: '0' };

  assert.equal(getSoccerMatchNotificationPhase(pre, live), 'start');
  assert.equal(getSoccerMatchNotificationPhase(previousLive, live), null);
  assert.equal(getSoccerMatchNotificationPhase(
    previousLive,
    { ...live, home: { score: '1' } }
  ), 'score:1:0');
  assert.equal(getSoccerMatchNotificationPhase(
    previousLive,
    { state: 'post', home: { score: '1' }, away: { score: '0' } }
  ), 'final');
  assert.equal(getSoccerMatchNotificationPhase(null, {
    state: 'post', home: { score: '1' }, away: { score: '0' }
  }), null);
});

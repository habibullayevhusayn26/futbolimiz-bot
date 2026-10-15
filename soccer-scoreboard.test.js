const assert = require('node:assert/strict');
const test = require('node:test');
const {
  app,
  fetchSoccerScoreboard,
  fetchSoccerStandings,
  getMiniAppUrl,
  isValidScoreboardDate,
  normalizeSoccerEvent,
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
        { homeAway: 'home', score: '2', team: { displayName: 'Home FC', logo: 'https://example.com/home.png' } },
        { homeAway: 'away', score: '1', team: { displayName: 'Away FC', logo: 'https://example.com/away.png' } }
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
    home: { name: 'Home FC', logo: 'https://example.com/home.png', score: '2' },
    away: { name: 'Away FC', logo: 'https://example.com/away.png', score: '1' },
    venue: ''
  });
  assert.equal(normalizeSoccerEvent({ competitions: [] }, { id: 'eng.1', name: 'Premier League' }), null);
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
  assert.match(await page.text(), /Futbol olami/);

  const invalidDate = await fetch(`${baseUrl}/api/mini-app/scoreboard?date=20260230`);
  assert.equal(invalidDate.status, 400);
  const invalidLeague = await fetch(`${baseUrl}/api/mini-app/standings?league=uzb.1`);
  assert.equal(invalidLeague.status, 400);
});

test('uses the configured public origin with the embedded app path', () => {
  assert.match(getMiniAppUrl(), /^https:\/\/.+\/mini-app\/$/);
});

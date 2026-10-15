const assert = require('node:assert/strict');
const test = require('node:test');
const {
  app,
  fetchSoccerScoreboard,
  getMiniAppUrl,
  isValidScoreboardDate,
  normalizeSoccerEvent,
  normalizeTheSportsDbEvent,
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

test('includes only the seven requested competitions', () => {
  assert.deepEqual(soccerLeagues.map((league) => league.name), [
    'UEFA Chempionlar Ligasi',
    'Angliya Premyer Ligasi',
    'LaLiga',
    'Ligue 1',
    'A Seriya',
    'Bundesliga',
    'O‘zbekiston Superligasi'
  ]);
});

test('normalizes Uzbekistan Super League events from TheSportsDB', () => {
  const event = normalizeTheSportsDbEvent({
    idEvent: 'uz-1',
    strTimestamp: '2026-10-15T15:00:00',
    strStatus: 'FT',
    strHomeTeam: 'Paxtakor',
    strHomeTeamBadge: 'https://example.com/paxtakor.png',
    intHomeScore: 2,
    strAwayTeam: 'Bunyodkor',
    intAwayScore: 1,
    strVenue: 'Paxtakor Markaziy Stadion'
  }, { id: '4794', name: 'O‘zbekiston Superligasi' });

  assert.deepEqual(event, {
    id: 'uz-1',
    leagueId: '4794',
    leagueName: 'O‘zbekiston Superligasi',
    startTime: '2026-10-15T15:00:00Z',
    state: 'post',
    status: 'FT',
    clock: '',
    home: { name: 'Paxtakor', logo: 'https://example.com/paxtakor.png', score: 2 },
    away: { name: 'Bunyodkor', logo: '', score: 1 },
    venue: 'Paxtakor Markaziy Stadion'
  });
  const scheduledEvent = normalizeTheSportsDbEvent({
    strHomeTeam: 'Andijon',
    strAwayTeam: 'Sogdiana',
    dateEvent: '2026-02-27',
    dateEventLocal: '2026-02-27',
    strTimeLocal: '14:00:00'
  }, { id: '4794', name: 'O‘zbekiston Superligasi' });
  assert.equal(scheduledEvent.startTime, '2026-02-27T14:00:00+05:00');
  assert.equal(normalizeTheSportsDbEvent({ strHomeTeam: 'Paxtakor' }, { id: '4794', name: 'O‘zbekiston Superligasi' }), null);
});

test('loads selected competitions from ESPN and TheSportsDB and caches the scoreboard', async () => {
  const date = '20261015';
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    const isPremierLeague = String(url).includes('/eng.1/scoreboard');
    const isUzbekistanLeague = String(url).includes('eventsseason.php');
    return {
      ok: true,
      json: async () => ({
        events: isUzbekistanLeague ? [{
          idEvent: 'uz-1',
          idLeague: '4794',
          dateEvent: '2026-10-15',
          strTimestamp: '2026-10-15T15:00:00',
          strStatus: 'FT',
          strHomeTeam: 'Paxtakor',
          intHomeScore: 2,
          strAwayTeam: 'Bunyodkor',
          intAwayScore: 1
        }, {
          idEvent: 'other-1',
          idLeague: '1',
          strHomeTeam: 'Other home',
          strAwayTeam: 'Other away'
        }] : isPremierLeague ? [{
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
  assert.equal(first.events.length, 2);
  assert.ok(first.events.some((event) => event.leagueName === 'Angliya Premyer Ligasi'));
  assert.ok(first.events.some((event) => event.leagueName === 'O‘zbekiston Superligasi'));
  assert.ok(first.events.every((event) => event.leagueId !== '1'));
  assert.equal(first.partial, false);
  assert.equal(calls.length, soccerLeagues.length);
  assert.equal(calls.filter((url) => url.includes(`dates=${date}`)).length, soccerLeagues.length - 1);
  assert.ok(calls.some((url) => url.includes('eventsseason.php') && url.includes('s=2026')));
  assert.equal(await fetchSoccerScoreboard(date, fakeFetch), first);
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
});

test('uses the configured public origin with the embedded app path', () => {
  assert.match(getMiniAppUrl(), /^https:\/\/.+\/mini-app\/$/);
});

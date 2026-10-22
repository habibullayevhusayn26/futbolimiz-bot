require('dotenv').config();
const config = require('./config');
process.env.TZ = config.timezone;

const mongoose = require('mongoose');
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Telegraf, Markup, session } = require('telegraf');

const mongoConnection = mongoose.connection;

const favoriteSoccerMatchDetailSchema = new mongoose.Schema({
  id: String,
  homeName: String,
  awayName: String,
  leagueName: String
}, { _id: false });

const userSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true, index: true },
  username: { type: String, default: '' },
  nickname: { type: String, default: '' },
  favoriteSoccerTeamIds: { type: [String], default: [] },
  favoriteSoccerMatchIds: { type: [String], default: [] },
  favoriteSoccerMatchDetails: { type: [favoriteSoccerMatchDetailSchema], default: [] },
  joinedAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now }
}, { versionKey: false });

const adminSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true, index: true },
  username: { type: String, default: '' },
  nickname: { type: String, default: '' },
  permissions: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const sessionSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 }
}, { versionKey: false });

const broadcastSchema = new mongoose.Schema({
  total: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  blocked: { type: Number, default: 0 },
  removed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const adminLogSchema = new mongoose.Schema({
  adminTelegramId: { type: Number, required: true, index: true },
  adminName: { type: String, default: '' },
  action: { type: String, required: true },
  details: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

const joinRequestChatSchema = new mongoose.Schema({
  chatId: { type: Number, unique: true, required: true, index: true },
  title: { type: String, default: '' },
  type: { type: String, enum: ['channel', 'group', 'supergroup'], required: true },
  username: { type: String, default: '' },
  linkedBy: { type: Number, default: null },
  paused: { type: Boolean, default: false },
  welcomeMessage: { type: String, default: 'Sizni tez orada qabul qilamiz!' },
  welcomeEntities: { type: [mongoose.Schema.Types.Mixed], default: [] },
  welcomeMediaType: { type: String, enum: ['', 'photo', 'video', 'animation'], default: '' },
  welcomeMediaFileId: { type: String, default: '' },
  welcomeButtons: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

const pendingJoinRequestSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  userId: { type: Number, required: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  requestedAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 }
}, { versionKey: false });
pendingJoinRequestSchema.index({ chatId: 1, userId: 1 }, { unique: true });

const joinRequestLinkCodeSchema = new mongoose.Schema({
  telegramId: { type: Number, unique: true, required: true, index: true },
  codeHash: { type: String, unique: true, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  claimedAt: { type: Date, default: null },
  claimedChatId: { type: Number, default: null }
}, { versionKey: false });

const miniAppVisitSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  visitedAt: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { versionKey: false });
miniAppVisitSchema.index({ telegramId: 1, visitedAt: -1 });

const soccerMatchNotificationSchema = new mongoose.Schema({
  eventKey: { type: String, unique: true, required: true },
  deliveredUserIds: { type: [Number], default: [] },
  blockedUserIds: { type: [Number], default: [] },
  completed: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

const soccerMatchStateSchema = new mongoose.Schema({
  eventKey: { type: String, unique: true, required: true },
  state: { type: String, required: true },
  homeScore: { type: String, default: '' },
  awayScore: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

const botConfigSchema = new mongoose.Schema({
  configKey: { type: String, default: 'main_config', unique: true },
  channels: { type: Array, default: [] },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { versionKey: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Admin = mongoose.models.BotAdmin || mongoose.model('BotAdmin', adminSchema);
const BotConfig = mongoose.models.BotConfig || mongoose.model('BotConfig', botConfigSchema);
const Session = mongoose.models.BotSession || mongoose.model('BotSession', sessionSchema);
const Broadcast = mongoose.models.Broadcast || mongoose.model('Broadcast', broadcastSchema);
const AdminLog = mongoose.models.AdminLog || mongoose.model('AdminLog', adminLogSchema);
const JoinRequestChat = mongoose.models.JoinRequestChat || mongoose.model('JoinRequestChat', joinRequestChatSchema);
const PendingJoinRequest = mongoose.models.PendingJoinRequest || mongoose.model('PendingJoinRequest', pendingJoinRequestSchema);
const JoinRequestLinkCode = mongoose.models.JoinRequestLinkCode || mongoose.model('JoinRequestLinkCode', joinRequestLinkCodeSchema);
const MiniAppVisit = mongoose.models.MiniAppVisit || mongoose.model('MiniAppVisit', miniAppVisitSchema);
const SoccerMatchNotification = mongoose.models.SoccerMatchNotification ||
  mongoose.model('SoccerMatchNotification', soccerMatchNotificationSchema);
const SoccerMatchState = mongoose.models.SoccerMatchState ||
  mongoose.model('SoccerMatchState', soccerMatchStateSchema);

const app = express();
const port = Number(process.env.PORT) || 3000;
app.use(express.json({ limit: '8kb' }));
const miniAppOrigin = (() => {
  try {
    return new URL(config.webAppUrl).origin;
  } catch {
    return null;
  }
})();
app.use('/api/mini-app', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && origin !== miniAppOrigin) {
    return res.status(403).json({ ok: false, error: 'Origin not allowed.' });
  }
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

let soccerLiveStreams = [];
const activeSoccerStreamViewers = new Map();

function pruneLiveStreamViewers(now = Date.now()) {
  const activeSince = now - 45_000;
  for (const [viewerId, viewer] of activeSoccerStreamViewers) {
    if (viewer.lastSeenAt < activeSince) activeSoccerStreamViewers.delete(viewerId);
  }
}

function getActiveLiveViewerCount(streamId, now = Date.now()) {
  pruneLiveStreamViewers(now);
  let count = 0;
  for (const viewer of activeSoccerStreamViewers.values()) {
    if (viewer.streamId === streamId) count += 1;
  }
  return count;
}

function recordLiveStreamViewer(viewerId, streamId, now = Date.now()) {
  pruneLiveStreamViewers(now);
  if (activeSoccerStreamViewers.size >= 20_000 && !activeSoccerStreamViewers.has(viewerId)) {
    return null;
  }
  activeSoccerStreamViewers.set(viewerId, { streamId, lastSeenAt: now });
  return getActiveLiveViewerCount(streamId, now);
}

function publicLiveStream(stream) {
  if (!stream) return null;
  return {
    id: stream.id,
    type: stream.type,
    url: stream.url,
    embedUrl: stream.embedUrl,
    title: stream.title,
    match: stream.match || null
  };
}

function normalizeSavedSoccerLiveStreams(savedStreams, legacyStream) {
  const saved = Array.isArray(savedStreams)
    ? savedStreams
    : legacyStream
      ? [legacyStream]
      : [];
  return saved.flatMap((savedStream) => {
    const normalized = savedStream && normalizeSoccerLiveStream(savedStream.url);
    if (!normalized) return [];
    return [{
      ...normalized,
      id: typeof savedStream.id === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(savedStream.id)
        ? savedStream.id
        : crypto.randomUUID(),
      title: String(savedStream.title || ''),
      match: savedStream.match && typeof savedStream.match === 'object'
        ? {
          id: String(savedStream.match.id || ''),
          leagueId: String(savedStream.match.leagueId || ''),
          leagueName: String(savedStream.match.leagueName || ''),
          startTime: String(savedStream.match.startTime || ''),
          homeName: String(savedStream.match.homeName || ''),
          awayName: String(savedStream.match.awayName || ''),
          homeLogo: String(savedStream.match.homeLogo || ''),
          awayLogo: String(savedStream.match.awayLogo || '')
        }
        : null
    }];
  });
}

function getPublicLiveStreams() {
  return soccerLiveStreams.map((stream) => ({
    ...publicLiveStream(stream),
    viewers: getActiveLiveViewerCount(stream.id)
  }));
}

app.get('/api/mini-app/live-stream', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const streams = getPublicLiveStreams();
  return res.status(200).json({
    streams,
    stream: streams[0] || null,
    viewers: streams[0]?.viewers || 0
  });
});

app.post('/api/mini-app/live-stream/viewer', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const viewerId = String(req.body?.viewerId || '');
  const streamId = String(req.body?.streamId || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(viewerId) || !/^[A-Za-z0-9_-]{16,80}$/.test(streamId)) {
    return res.status(400).json({ ok: false, error: 'Tomoshabin ma’lumoti noto‘g‘ri.' });
  }
  const stream = soccerLiveStreams.find((item) => item.id === streamId);
  if (!stream) {
    return res.status(200).json({
      viewers: 0,
      streamChanged: true,
      streams: getPublicLiveStreams()
    });
  }
  const viewers = recordLiveStreamViewer(viewerId, streamId);
  if (viewers === null) {
    return res.status(429).json({ ok: false, error: 'Tomoshabinlar soni vaqtincha cheklangan.' });
  }
  return res.status(200).json({ viewers, streams: getPublicLiveStreams() });
});
app.use('/mini-app', express.static(path.join(__dirname, 'mini-app')));
app.get('/mini-app', (req, res) => res.sendFile(path.join(__dirname, 'mini-app', 'index.html')));
app.get('/', (req, res) => res.send('Movie bot ishlamoqda...'));
app.get('/health', (req, res) => res.status(200).json({
  ok: true,
  mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));

const soccerLeagues = [
  { id: 'uefa.champions', name: 'UEFA Chempionlar Ligasi' },
  { id: 'uefa.europa', name: 'UEFA Yevropa Ligasi' },
  { id: 'uefa.europa.conf', name: 'UEFA Konferensiyalar Ligasi' },
  { id: 'eng.1', name: 'Angliya Premyer Ligasi' },
  { id: 'esp.1', name: 'LaLiga' },
  { id: 'fra.1', name: 'Ligue 1' },
  { id: 'ita.1', name: 'A Seriya' },
  { id: 'ger.1', name: 'Bundesliga' }
];
const soccerScoreboardCache = new Map();
const soccerScoreboardRequests = new Map();
const soccerStandingsCache = new Map();
const soccerStandingsRequests = new Map();
const soccerMatchDetailsCache = new Map();
const soccerMatchDetailsRequests = new Map();
const scoreboardCacheTtlMs = 30_000;
const standingsCacheTtlMs = 5 * 60_000;
const matchDetailsCacheTtlMs = 30_000;
const soccerMatchNotificationPollMs = 30_000;
const scoreboardDatePattern = /^\d{8}$/;
let soccerMatchNotificationTimer;
let soccerMatchNotificationPollRunning = false;

function normalizeSoccerLiveStream(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 2048) return null;

  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const youtubeHosts = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
    'youtube-nocookie.com',
    'www.youtube-nocookie.com'
  ]);
  const hostname = url.hostname.toLowerCase();
  if (youtubeHosts.has(hostname)) {
    const videoId = hostname === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') ||
        url.pathname.match(/^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null;
    return {
      type: 'youtube',
      url: url.href,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`
    };
  }

  if (/\.m3u8$/i.test(url.pathname)) {
    return { type: 'hls', url: url.href };
  }
  return null;
}

function isValidScoreboardDate(date) {
  if (!scoreboardDatePattern.test(date)) return false;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  return parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;
}

function normalizeSoccerEvent(event, league) {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((competitor) => competitor.homeAway === 'home');
  const away = competitors.find((competitor) => competitor.homeAway === 'away');
  if (!home?.team || !away?.team) return null;

  const status = competition.status?.type || {};
  const state = ['pre', 'in', 'post'].includes(status.state) ? status.state : 'pre';
  return {
    id: event.id,
    leagueId: league.id,
    leagueName: league.name,
    startTime: competition.date || event.date,
    state,
    status: status.shortDetail || status.detail || status.description || '',
    clock: competition.status?.displayClock || '',
    home: {
      id: String(home.team.id || home.id || ''),
      name: home.team.displayName || home.team.name || '',
      logo: home.team.logo || '',
      score: home.score ?? ''
    },
    away: {
      id: String(away.team.id || away.id || ''),
      name: away.team.displayName || away.team.name || '',
      logo: away.team.logo || '',
      score: away.score ?? ''
    },
    venue: competition.venue?.fullName || ''
  };
}

function normalizeSoccerMatchDetails(payload) {
  const boxscore = payload.boxscore || {};
  const rawPlays = Array.isArray(payload.plays) && payload.plays.length
    ? payload.plays
    : Array.isArray(payload.keyEvents) && payload.keyEvents.length
      ? payload.keyEvents
      : payload.commentary?.items || [];
  const matchStatPattern = /possession|pass|shot|corner|foul|card|save|offside|tackle|interception|cross|clearance|block|dribble|touch|duel/i;
  const getTeamName = (team) => team?.team?.displayName || team?.team?.name || '';
  const getPlayers = (roster) => (roster.roster || roster.athletes || [])
    .map((entry) => {
      const athlete = entry?.athlete || entry;
      if (!athlete) return null;
      const starterStat = (Array.isArray(entry?.stats) ? entry.stats : []).find((stat) => stat.name === 'starter');
      const starterValue = starterStat?.value ?? starterStat?.displayValue;
      return {
        name: athlete.displayName || athlete.fullName || athlete.shortName || '',
        position: entry?.position?.abbreviation || entry?.position?.displayName ||
          athlete.position?.abbreviation || athlete.position?.displayName || athlete.position || '',
        jersey: entry?.jersey || athlete.jersey || '',
        formationPlace: entry?.formationPlace || '',
        starter: entry?.starter === true || entry?.starter === 1 || athlete.starter === true ||
          starterValue === true || starterValue === 1 || starterValue === '1'
      };
    })
    .filter((player) => player?.name);
  const rosters = (payload.rosters || []).map((roster) => ({
    homeAway: roster.homeAway || '',
    teamName: getTeamName(roster),
    formation: roster.formation || roster.team?.formation || '',
    players: getPlayers(roster)
  }));
  for (const team of boxscore.players || []) {
    if (rosters.some((roster) => roster.homeAway === team.homeAway)) continue;
    rosters.push({
      homeAway: team.homeAway || '',
      teamName: getTeamName(team),
      formation: team.formation || '',
      players: getPlayers(team)
    });
  }
  const teams = boxscore.teams || [];
  return {
    events: rawPlays
      .map((item) => {
        const play = item.play || item;
        return {
          clock: play.clock?.displayValue || item.clock?.displayValue || item.time?.displayValue ||
            (typeof play.clock === 'string' ? play.clock : '') ||
            (typeof item.time === 'string' ? item.time : ''),
          type: typeof play.type === 'string' ? play.type : play.type?.text || play.type?.name || '',
          text: play.text || item.text || play.shortText || play.description || '',
          teamId: String(play.team?.id || item.team?.id || ''),
          athletes: (play.participants || item.participants || play.athletes || item.athletes || [])
            .map((participant) => participant?.athlete?.displayName || participant?.displayName || participant?.name || '')
            .filter(Boolean)
        };
      })
      .filter((play) => (play.text || play.type) &&
        /goal|substitut|yellow|red card|penalty|kick.?off|half|match ends|offside|corner|save|injur|var|shoot.?out|extra time/i
          .test(`${play.type} ${play.text}`)),
    lineups: rosters,
    statistics: teams.map((team) => ({
      homeAway: team.homeAway || '',
      teamName: getTeamName(team),
      stats: (team.statistics || [])
        .map((stat) => ({
          name: stat.label || stat.name || '',
          value: stat.displayValue ?? stat.value ?? ''
        }))
        .filter((stat) => stat.name && String(stat.value) !== '' && matchStatPattern.test(stat.name))
    }))
  };
}

async function fetchSoccerMatchDetails(leagueId, eventId, fetchImpl = fetch) {
  const league = soccerLeagues.find((item) => item.id === leagueId);
  if (!league) throw new Error('Noma’lum musobaqa tanlandi.');
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(eventId)) throw new Error('O‘yin ID noto‘g‘ri.');
  const cacheKey = `${leagueId}:${eventId}`;
  const cached = soccerMatchDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const pending = soccerMatchDetailsRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/summary`);
    url.searchParams.set('event', eventId);
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`ESPN ${response.status} (${league.id}/${eventId})`);
    const data = normalizeSoccerMatchDetails(await response.json());
    soccerMatchDetailsCache.set(cacheKey, { data, expiresAt: Date.now() + matchDetailsCacheTtlMs });
    return data;
  })().finally(() => soccerMatchDetailsRequests.delete(cacheKey));
  soccerMatchDetailsRequests.set(cacheKey, request);
  return request;
}

function normalizeSoccerStandings(events, league, season) {
  const teams = new Map();
  const seasonStart = Date.parse(season.startDate);
  const completedEvents = events
    .filter((event) => {
      const competition = event.competitions?.[0];
      const eventDate = Date.parse(event.date || competition?.date || '');
      return competition?.status?.type?.state === 'post' &&
        Number.isFinite(eventDate) &&
        eventDate >= seasonStart &&
        (league.id !== 'uefa.champions' || event.season?.slug === 'league-phase');
    })
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  for (const event of completedEvents) {
    const competitors = event.competitions[0].competitors || [];
    const home = competitors.find((competitor) => competitor.homeAway === 'home');
    const away = competitors.find((competitor) => competitor.homeAway === 'away');
    if (home?.score === null || home?.score === undefined || String(home.score).trim() === '' ||
        away?.score === null || away?.score === undefined || String(away.score).trim() === '') continue;
    const homeGoals = Number(home?.score);
    const awayGoals = Number(away?.score);
    if (!home?.team || !away?.team || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

    const getTeam = (competitor) => {
      const id = competitor.team.id || competitor.id;
      if (!teams.has(id)) {
        teams.set(id, {
          id: String(id),
          name: competitor.team.displayName || competitor.team.name || '',
          logo: competitor.team.logo || '',
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
          form: []
        });
      }
      return teams.get(id);
    };

    const homeTeam = getTeam(home);
    const awayTeam = getTeam(away);
    homeTeam.played += 1;
    awayTeam.played += 1;
    homeTeam.goalsFor += homeGoals;
    homeTeam.goalsAgainst += awayGoals;
    awayTeam.goalsFor += awayGoals;
    awayTeam.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      homeTeam.wins += 1;
      awayTeam.losses += 1;
      homeTeam.points += 3;
      homeTeam.form.push('W');
      awayTeam.form.push('L');
    } else if (homeGoals < awayGoals) {
      awayTeam.wins += 1;
      homeTeam.losses += 1;
      awayTeam.points += 3;
      homeTeam.form.push('L');
      awayTeam.form.push('W');
    } else {
      homeTeam.draws += 1;
      awayTeam.draws += 1;
      homeTeam.points += 1;
      awayTeam.points += 1;
      homeTeam.form.push('D');
      awayTeam.form.push('D');
    }
  }

  const table = [...teams.values()]
    .map((team) => ({ ...team, goalDifference: team.goalsFor - team.goalsAgainst, form: team.form.slice(-5) }))
    .sort((left, right) =>
      right.points - left.points ||
      right.goalDifference - left.goalDifference ||
      right.goalsFor - left.goalsFor ||
      right.wins - left.wins ||
      left.name.localeCompare(right.name)
    )
    .map((team, index) => ({ rank: index + 1, ...team }));

  return {
    leagueId: league.id,
    leagueName: league.name,
    season: season.displayName || String(season.year),
    updatedAt: new Date().toISOString(),
    teams: table
  };
}

function fetchSoccerLeagueStandings(league, year, fetchImpl) {
  const cacheKey = `${league.id}:${year}`;
  const cached = soccerStandingsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
  const pending = soccerStandingsRequests.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard`);
    url.searchParams.set('dates', String(year));
    url.searchParams.set('limit', '1000');
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`ESPN ${response.status} (${league.id})`);
    const payload = await response.json();
    const season = payload.leagues?.[0]?.season;
    if (!season?.startDate || !Array.isArray(payload.events)) {
      throw new Error(`ESPN standings data is unavailable for ${league.name}.`);
    }
    const data = normalizeSoccerStandings(payload.events, league, season);
    soccerStandingsCache.set(cacheKey, { data, expiresAt: Date.now() + standingsCacheTtlMs });
    return data;
  })().finally(() => soccerStandingsRequests.delete(cacheKey));
  soccerStandingsRequests.set(cacheKey, request);
  return request;
}

async function fetchSoccerStandings(leagueId, year, fetchImpl = fetch) {
  const leagues = leagueId === 'all'
    ? soccerLeagues
    : soccerLeagues.filter((league) => league.id === leagueId);
  if (!leagues.length) throw new Error('Noma’lum musobaqa tanlandi.');

  const results = await Promise.allSettled(
    leagues.map((league) => fetchSoccerLeagueStandings(league, year, fetchImpl))
  );
  const tables = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const failedLeagues = results
    .map((result, index) => result.status === 'rejected' ? leagues[index].name : null)
    .filter(Boolean);
  if (!tables.length) throw new Error('Turnir jadvallarini hozir olib bo\'lmadi.');
  return { season: String(year), tables, partial: failedLeagues.length > 0, failedLeagues };
}

async function loadSoccerScoreboard(date, fetchImpl) {
  const events = [];
  let nextLeagueIndex = 0;
  let successfulLeagues = 0;
  const workerCount = Math.min(5, soccerLeagues.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextLeagueIndex < soccerLeagues.length) {
      const league = soccerLeagues[nextLeagueIndex];
      nextLeagueIndex += 1;
      try {
        const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard`);
        url.searchParams.set('dates', date);
        url.searchParams.set('limit', '100');
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`ESPN ${response.status} (${league.id})`);
        const payload = await response.json();
        successfulLeagues += 1;
        events.push(...(payload.events || [])
          .map((event) => normalizeSoccerEvent(event, league))
          .filter(Boolean));
      } catch (error) {
        console.error(`Scoreboard request failed for ${league.name}:`, error.message);
      }
    }
  });
  await Promise.all(workers);

  if (!successfulLeagues) throw new Error('O\'yinlar ma\'lumotini hozir olib bo\'lmadi.');
  events.sort((left, right) => new Date(left.startTime) - new Date(right.startTime));
  const data = {
    date,
    leagues: soccerLeagues,
    events,
    partial: successfulLeagues < soccerLeagues.length
  };
  return data;
}

function fetchSoccerScoreboard(date, fetchImpl = fetch) {
  if (!isValidScoreboardDate(date)) throw new Error('Sana YYYYMMDD ko\'rinishida bo\'lishi kerak.');
  const cache = soccerScoreboardCache.get(date);
  if (cache && cache.expiresAt > Date.now()) return Promise.resolve(cache.data);
  const pendingRequest = soccerScoreboardRequests.get(date);
  if (pendingRequest) return pendingRequest;

  const request = loadSoccerScoreboard(date, fetchImpl)
    .then((data) => {
      soccerScoreboardCache.set(date, { data, expiresAt: Date.now() + scoreboardCacheTtlMs });
      return data;
    })
    .finally(() => soccerScoreboardRequests.delete(date));
  soccerScoreboardRequests.set(date, request);
  return request;
}

function getTashkentScoreboardDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}${values.month}${values.day}`;
}

function getMatchMiniAppUrl(event) {
  if (!event?.id || !event?.startTime || !Number.isFinite(Date.parse(event.startTime))) {
    throw new Error('Match ID and valid start time are required to build a Mini App link.');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(event.startTime));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const url = new URL(getMiniAppUrl());
  url.searchParams.set('match', String(event.id));
  if (event.leagueId) url.searchParams.set('league', String(event.leagueId));
  url.searchParams.set('date', `${values.year}-${values.month}-${values.day}`);
  return url.toString();
}

function findNextScheduledSoccerMatch(events, now = Date.now()) {
  return events
    .filter((event) => event.state === 'pre' && event.startTime &&
      Number.isFinite(Date.parse(event.startTime)) && Date.parse(event.startTime) > now)
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime))[0] || null;
}

function findSoccerMatchesStartingWithin(events, now = Date.now(), windowMs = 30 * 60_000) {
  return events
    .filter((event) => {
      const startTime = Date.parse(event.startTime || '');
      if (!Number.isFinite(startTime)) return false;
      return (event.state === 'pre' && startTime >= now && startTime <= now + windowMs) ||
        event.state === 'in';
    })
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
}

async function findUpcomingStreamMatches(now = Date.now()) {
  const results = await Promise.all([
    fetchSoccerScoreboard(getTashkentScoreboardDate(new Date(now))),
    fetchSoccerScoreboard(getTashkentScoreboardDate(new Date(now + 24 * 60 * 60 * 1000)))
  ]);
  return findSoccerMatchesStartingWithin(results.flatMap((result) => result.events), now);
}

function formattedMatchTime(value) {
  return new Intl.DateTimeFormat('uz-UZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tashkent'
  }).format(new Date(value));
}

function getSoccerMatchKey(event) {
  return `${event.leagueId}:${event.id}`;
}

function isUndeliverableUserError(error) {
  if (error.response?.error_code === 403) return true;
  if (error.response?.error_code !== 400) return false;
  return /chat not found|user not found|user is deactivated|can't initiate conversation|cannot initiate conversation/i
    .test(error.response?.description || error.message || '');
}

async function removeUndeliverableUser(telegramId, error, source) {
  if (!isUndeliverableUserError(error)) return false;
  try {
    const result = await User.deleteOne({ telegramId });
    return result.deletedCount === 1;
  } catch (deleteError) {
    console.error(
      `Could not remove undeliverable user ${telegramId} after ${source}:`,
      deleteError.response?.description || deleteError.message
    );
    return false;
  }
}

function getSoccerMatchSubscribers(event) {
  const teamIds = [event.home.id, event.away.id].filter(Boolean);
  const matchIds = [String(event.id)];
  return User.find({
    $or: [
      { favoriteSoccerTeamIds: { $in: teamIds } },
      { favoriteSoccerMatchIds: { $in: matchIds } }
    ]
  }, {
    telegramId: 1,
    favoriteSoccerTeamIds: 1,
    favoriteSoccerMatchIds: 1
  }).lean();
}

function isSubscribedToSoccerMatch(user, event) {
  const teamIds = new Set(user.favoriteSoccerTeamIds || []);
  const matchIds = new Set(user.favoriteSoccerMatchIds || []);
  return teamIds.has(event.home.id) || teamIds.has(event.away.id) ||
    matchIds.has(String(event.id));
}

function getSoccerMatchNotificationPhase(previous, event) {
  if (event.state === 'in' && previous?.state !== 'in') return 'start';
  if (event.state === 'in' && previous?.state === 'in' &&
      (String(event.home.score ?? '') !== previous.homeScore ||
        String(event.away.score ?? '') !== previous.awayScore)) {
    return `score:${String(event.home.score ?? '')}:${String(event.away.score ?? '')}`;
  }
  if (event.state === 'post' && previous?.state === 'in') return 'final';
  return null;
}

async function sendSoccerMatchNotification(event, phase, heading) {
  const recipients = (await getSoccerMatchSubscribers(event))
    .filter((user) => isSubscribedToSoccerMatch(user, event));
  if (!recipients.length) return;

  const eventKey = `${getSoccerMatchKey(event)}:${phase}`;
  let notification;
  try {
    notification = await SoccerMatchNotification.findOneAndUpdate(
      { eventKey },
      { $setOnInsert: { eventKey } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    if (error.code === 11000) notification = await SoccerMatchNotification.findOne({ eventKey }).lean();
    else throw error;
  }
  if (!notification) throw new Error(`Could not load live match notification record ${eventKey}.`);
  if (notification.completed) return;

  const deliveredUserIds = new Set(notification.deliveredUserIds || []);
  const blockedUserIds = new Set(notification.blockedUserIds || []);
  const text = [
    `${heading}`,
    ``,
    `<b>${escapeHtml(event.home.name)} — ${escapeHtml(event.away.name)}</b>`,
    `${escapeHtml(event.leagueName)} · ${escapeHtml(event.status || 'Jonli efir')}`,
    `Hisob: ${escapeHtml(event.home.score || '0')} : ${escapeHtml(event.away.score || '0')}`
  ].join('\n');
  const replyMarkup = Markup.inlineKeyboard([[
    Markup.button.webApp('⚽ O‘yin ma’lumotlari', getMatchMiniAppUrl(event))
  ]]).reply_markup;

  let deliveredThisPass = 0;
  let failedThisPass = 0;
  for (const user of recipients) {
    if (deliveredUserIds.has(user.telegramId) || blockedUserIds.has(user.telegramId)) continue;
    try {
      await bot.telegram.sendMessage(user.telegramId, text, {
        parse_mode: 'HTML',
        protect_content: true,
        reply_markup: replyMarkup
      });
      await SoccerMatchNotification.updateOne(
        { eventKey },
        { $addToSet: { deliveredUserIds: user.telegramId }, $set: { updatedAt: new Date() } }
      );
      deliveredUserIds.add(user.telegramId);
      deliveredThisPass += 1;
    } catch (error) {
      failedThisPass += 1;
      if (isUndeliverableUserError(error)) {
        await SoccerMatchNotification.updateOne(
          { eventKey },
          { $addToSet: { blockedUserIds: user.telegramId }, $set: { updatedAt: new Date() } }
        );
        blockedUserIds.add(user.telegramId);
        await removeUndeliverableUser(user.telegramId, error, 'live match notification');
      }
      console.error(`Live match notification ${eventKey} to ${user.telegramId} failed:`, error.response?.description || error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const completed = recipients.every((user) =>
    deliveredUserIds.has(user.telegramId) || blockedUserIds.has(user.telegramId)
  );
  if (completed) {
    await SoccerMatchNotification.updateOne(
      { eventKey },
      { $set: { completed: true, updatedAt: new Date() } }
    );
  }
  console.log(`Live match notification ${eventKey}: delivered=${deliveredThisPass}, failed=${failedThisPass}, complete=${completed}`);
}

async function notifySoccerMatchUpdates(events) {
  const validEvents = events.filter((event) =>
    event.state && event.id && event.leagueId &&
    event.home?.id && event.away?.id && event.home?.name && event.away?.name
  );

  for (const event of validEvents) {
    const eventKey = getSoccerMatchKey(event);
    const previous = await SoccerMatchState.findOne({ eventKey }).lean();
    const currentHomeScore = String(event.home.score ?? '');
    const currentAwayScore = String(event.away.score ?? '');
    const phase = getSoccerMatchNotificationPhase(previous, event);

    if (phase === 'start') {
      await sendSoccerMatchNotification(event, 'start', '🔴 <b>O‘yin boshlandi!</b>');
    } else if (phase?.startsWith('score:')) {
      await sendSoccerMatchNotification(event, phase, '⚽ <b>Hisob o‘zgardi!</b>');
    } else if (phase === 'final') {
      await sendSoccerMatchNotification(event, 'final', '🏁 <b>O‘yin yakunlandi!</b>');
    }

    await SoccerMatchState.findOneAndUpdate(
      { eventKey },
      {
        $set: {
          state: event.state,
          homeScore: currentHomeScore,
          awayScore: currentAwayScore,
          updatedAt: new Date()
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
}

async function pollStartedSoccerMatches() {
  if (soccerMatchNotificationPollRunning) return;
  soccerMatchNotificationPollRunning = true;
  try {
    const scoreboard = await fetchSoccerScoreboard(getTashkentScoreboardDate());
    await notifySoccerMatchUpdates(scoreboard.events);
  } catch (error) {
    console.error('Live match notification polling failed:', error.message);
  } finally {
    soccerMatchNotificationPollRunning = false;
  }
}

function startSoccerMatchNotificationPolling() {
  if (soccerMatchNotificationTimer) return;
  void pollStartedSoccerMatches();
  soccerMatchNotificationTimer = setInterval(
    () => void pollStartedSoccerMatches(),
    soccerMatchNotificationPollMs
  );
  soccerMatchNotificationTimer.unref?.();
}

app.get('/api/mini-app/scoreboard', async (req, res) => {
  const date = String(req.query.date || '');
  if (!isValidScoreboardDate(date)) {
    return res.status(400).json({ ok: false, error: 'Sana YYYYMMDD formatida yuborilishi kerak.' });
  }
  try {
    const scoreboard = await fetchSoccerScoreboard(date);
    return res.status(200).json(scoreboard);
  } catch (error) {
    console.error('Soccer scoreboard request failed:', error.message);
    return res.status(502).json({ ok: false, error: 'O\'yinlar ma\'lumotini olib bo\'lmadi. Keyinroq qayta urinib ko\'ring.' });
  }
});

app.get('/api/mini-app/match-details', async (req, res) => {
  const leagueId = String(req.query.league || '');
  const eventId = String(req.query.event || '');
  if (!soccerLeagues.some((league) => league.id === leagueId)) {
    return res.status(400).json({ ok: false, error: 'Tanlangan musobaqa mavjud emas.' });
  }
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(eventId)) {
    return res.status(400).json({ ok: false, error: 'O‘yin ID noto‘g‘ri.' });
  }
  try {
    return res.status(200).json(await fetchSoccerMatchDetails(leagueId, eventId));
  } catch (error) {
    console.error('Soccer match details request failed:', error.message);
    return res.status(502).json({ ok: false, error: 'O‘yin tafsilotlarini olib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' });
  }
});

app.get('/api/mini-app/standings', async (req, res) => {
  const leagueId = String(req.query.league || 'all');
  const season = String(req.query.season || new Date().getFullYear());
  if (leagueId !== 'all' && !soccerLeagues.some((league) => league.id === leagueId)) {
    return res.status(400).json({ ok: false, error: 'Tanlangan musobaqa mavjud emas.' });
  }
  if (!/^\d{4}$/.test(season) || Number(season) < 2000 || Number(season) > 2100) {
    return res.status(400).json({ ok: false, error: 'Mavsum yilini to‘g‘ri kiriting.' });
  }
  try {
    const standings = await fetchSoccerStandings(leagueId, Number(season));
    return res.status(200).json(standings);
  } catch (error) {
    console.error('Soccer standings request failed:', error.message);
    return res.status(502).json({ ok: false, error: 'Turnir jadvalini olib bo‘lmadi. Keyinroq qayta urinib ko‘ring.' });
  }
});

function verifyMiniAppInitData(initData, botToken = config.botToken, now = Date.now()) {
  if (typeof initData !== 'string' || !initData || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hashes = params.getAll('hash');
  const authDates = params.getAll('auth_date');
  const users = params.getAll('user');
  if (hashes.length !== 1 || authDates.length !== 1 || users.length !== 1 ||
      !/^[a-f0-9]{64}$/i.test(hashes[0])) return null;

  const authDate = Number(authDates[0]);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 60 ||
      nowSeconds - authDate > 24 * 60 * 60) return null;

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(hashes[0], 'hex');
  if (receivedHash.length !== expectedHash.length ||
      !crypto.timingSafeEqual(receivedHash, expectedHash)) return null;

  let user;
  try {
    user = JSON.parse(users[0]);
  } catch {
    return null;
  }
  if (!user || typeof user !== 'object' || Array.isArray(user) ||
      !Number.isSafeInteger(user.id) || user.id <= 0) return null;
  return { authDate, user };
}

app.post('/api/mini-app/visit', async (req, res) => {
  const verified = verifyMiniAppInitData(req.body?.initData);
  if (!verified) return res.status(401).json({ ok: false, error: 'Invalid or expired Telegram initData.' });
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ ok: false, error: 'Analytics storage is unavailable.' });
  }

  const now = new Date();
  const user = verified.user;
  try {
    await User.updateOne(
      { telegramId: user.id },
      {
        $set: {
          username: user.username || '',
          nickname: [user.first_name, user.last_name].filter(Boolean).join(' ') || '',
          lastActiveAt: now
        }
      }
    );
    await MiniAppVisit.create({
      telegramId: user.id,
      visitedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    });
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Mini App visit tracking failed:', error);
    return res.status(500).json({ ok: false, error: 'Mini App visit could not be recorded.' });
  }
});

app.post('/api/mini-app/notification-preferences', async (req, res) => {
  const verified = verifyMiniAppInitData(req.body?.initData);
  if (!verified) return res.status(401).json({ ok: false, error: 'Telegram foydalanuvchisi tasdiqlanmadi.' });
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ ok: false, error: 'Bildirishnoma sozlamalarini saqlash xizmati ishlamayapti.' });
  }

  const action = req.body?.action;
  try {
    if (action === 'get') {
      const user = await User.findOne(
        { telegramId: verified.user.id },
        { favoriteSoccerTeamIds: 1, favoriteSoccerMatchIds: 1, favoriteSoccerMatchDetails: 1 }
      ).lean();
      return res.status(200).json({
        favoriteTeamIds: user?.favoriteSoccerTeamIds || [],
        favoriteMatchIds: user?.favoriteSoccerMatchIds || [],
        favoriteMatches: user?.favoriteSoccerMatchDetails || []
      });
    }
    const eventDetails = req.body?.kind === 'match' && req.body.enabled ? req.body.eventDetails : null;
    if (action !== 'toggle' ||
        !['team', 'match'].includes(req.body?.kind) ||
        typeof req.body?.id !== 'string' ||
        !/^[a-zA-Z0-9._-]{1,64}$/.test(req.body.id) ||
        typeof req.body?.enabled !== 'boolean' ||
        (eventDetails && (
          eventDetails.id !== req.body.id ||
          ['homeName', 'awayName', 'leagueName'].some((key) =>
            typeof eventDetails[key] !== 'string' || eventDetails[key].trim().length < 1 || eventDetails[key].length > 100
          )
        ))) {
      return res.status(400).json({ ok: false, error: 'Bildirishnoma tanlovi noto‘g‘ri.' });
    }

    const field = req.body.kind === 'team' ? 'favoriteSoccerTeamIds' : 'favoriteSoccerMatchIds';
    const update = req.body.enabled
      ? { $addToSet: { [field]: req.body.id } }
      : { $pull: { [field]: req.body.id } };
    if (req.body.kind === 'match' && req.body.enabled && eventDetails) {
      update.$addToSet.favoriteSoccerMatchDetails = {
        id: req.body.id,
        homeName: eventDetails.homeName.trim(),
        awayName: eventDetails.awayName.trim(),
        leagueName: eventDetails.leagueName.trim()
      };
    }
    if (req.body.kind === 'match' && !req.body.enabled) {
      update.$pull.favoriteSoccerMatchDetails = { id: req.body.id };
    }
    const user = await User.findOneAndUpdate(
      { telegramId: verified.user.id },
      update,
      { returnDocument: 'after' }
    ).lean();
    if (!user) {
      return res.status(409).json({
        ok: false,
        error: 'Avval botga /start yuboring.'
      });
    }
    return res.status(200).json({
      favoriteTeamIds: user.favoriteSoccerTeamIds || [],
      favoriteMatchIds: user.favoriteSoccerMatchIds || [],
      favoriteMatches: user.favoriteSoccerMatchDetails || []
    });
  } catch (error) {
    console.error('Soccer notification preference update failed:', error);
    return res.status(500).json({ ok: false, error: 'Bildirishnoma sozlamasini saqlab bo‘lmadi.' });
  }
});

async function editCallbackMessage(ctx, text, options = {}) {
  const message = ctx.callbackQuery?.message;
  if (!message) return ctx.editMessageText(text, options);

  const editOptions = { ...options };
  delete editOptions.protect_content;
  if (typeof message.text === 'string') return ctx.editMessageText(text, editOptions);
  if (typeof message.caption === 'string' ||
      ['animation', 'audio', 'document', 'photo', 'video', 'voice'].some((type) => message[type])) {
    return ctx.editMessageCaption(text, editOptions);
  }
  return ctx.editMessageText(text, editOptions);
}

const decoratedReplyMarkups = new WeakSet();

function inlineButtonStyle(button) {
  if (button.callback_data === 'navigation:back' ||
      String(button.text || '').replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase() === 'orqaga') return 'danger';
  if (button.style) return button.style;
  const label = String(button.text || '').toLocaleLowerCase();
  const action = String(button.callback_data || '').toLocaleLowerCase();
  const content = `${label} ${action}`;
  if (/(bekor|cancel|delete|remove|o'chir|chiqish|exit|unlink|uzish|to'xtat|clear)/i.test(content)) return 'danger';
  if (/(qo'sh|add|save|saqlash|send|yubor|approve|qabul|tekshir|check|davom|resume|yoqish|connect)/i.test(content)) return 'success';
  return 'primary';
}

function colorInlineKeyboard(options) {
  const markup = options.reply_markup;
  if (!Array.isArray(markup?.inline_keyboard)) return options;
  let hasBackButton = false;
  const buttons = markup.inline_keyboard.flat().reduce((result, button) => {
    const isBackButton = button.callback_data === 'navigation:back' ||
      String(button.text || '').replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase() === 'orqaga';
    if (isBackButton && hasBackButton) return result;
    if (isBackButton) hasBackButton = true;
    result.push({ ...button, style: inlineButtonStyle(button) });
    return result;
  }, []);
  const rows = [];
  let row = [];
  let rowLength = 0;
  const flushRow = () => {
    if (row.length) rows.push(row);
    row = [];
    rowLength = 0;
  };

  for (const button of buttons) {
    const buttonLength = Array.from(String(button.text || '')).length;
    if (buttonLength > 17) {
      flushRow();
      rows.push([button]);
      continue;
    }
    if (row.length && (row.length === 2 || rowLength + buttonLength > 30)) flushRow();
    row.push(button);
    rowLength += buttonLength;
    if (row.length === 2) flushRow();
  }
  flushRow();

  return {
    ...options,
    reply_markup: {
      ...markup,
      inline_keyboard: rows
    }
  };
}

function addNavigationControls(extra = {}) {
  let options = { ...(extra || {}) };
  const originalMarkup = options.reply_markup || {};
  options = colorInlineKeyboard(options);
  const markup = options.reply_markup || {};
  const isMainMenu = Array.isArray(markup.inline_keyboard) &&
    markup.inline_keyboard.some((row) => row.some((button) => button.callback_data === 'welcome:applications'));
  const isAdminMainMenu = Array.isArray(markup.inline_keyboard) &&
    markup.inline_keyboard.some((row) => row.some((button) => button.callback_data === 'admin:exit'));
  if (isMainMenu || isAdminMainMenu) return options;
  if (originalMarkup && typeof originalMarkup === 'object' && decoratedReplyMarkups.has(originalMarkup)) {
    decoratedReplyMarkups.delete(originalMarkup);
    return options;
  }
  const hasBackButton = Array.isArray(markup.inline_keyboard) &&
    markup.inline_keyboard.flat().some((button) => button.callback_data === 'navigation:back' ||
      String(button.text || '').replace(/[^\p{L}\p{N}]/gu, '').toLocaleLowerCase() === 'orqaga');
  if (hasBackButton) return options;
  if (Array.isArray(markup.inline_keyboard)) {
    options.reply_markup = {
      ...markup,
      inline_keyboard: [...markup.inline_keyboard, [
        { ...Markup.button.callback('⬅️ Orqaga', 'navigation:back'), style: 'danger' }
      ]]
    };
  } else {
    options.reply_markup = Markup.inlineKeyboard([[
      { ...Markup.button.callback('⬅️ Orqaga', 'navigation:back'), style: 'danger' }
    ]]).reply_markup;
  }
  options = colorInlineKeyboard(options);
  decoratedReplyMarkups.add(options.reply_markup);
  return options;
}

const bot = new Telegraf(config.botToken);
const ADMIN_USERNAME = config.admin.username;
const ADMIN_TG_ID = config.admin.telegramId;
const mainMenuCommands = [
  { command: 'start', description: 'Asosiy menyuni ochish' },
  { command: 'app', description: 'Mini Appni ochish' },
  { command: 'live', description: 'Jonli efirlar ro‘yxati' },
  { command: 'connect', description: 'Kanal yoki guruhni ulash' },
  { command: 'mychats', description: 'Ulangan kanal va guruhlar' },
  { command: 'help', description: 'Yordam' },
  { command: 'admin', description: 'Admin panel' }
];
const adminPermissions = ['broadcast', 'stats', 'settings', 'join_requests', 'admins'];
const adminRegistry = new Map();
const activeAdminPanels = new Set();
const joinRequestChatIds = new Set();
const pendingJoinApprovals = new Set();
const pendingBulkJoinApprovals = new Set();
const pendingChatSelections = new Map();
const data = { settings: { requiredChannels: [] } };
const premiumEmojis = {
  welcome: '<tg-emoji emoji-id="5199785165735367039">⚡️</tg-emoji>',
  bot: '<tg-emoji emoji-id="5323359973365784232">🤖</tg-emoji>',
  confirm: '<tg-emoji emoji-id="5393275607083676065">✔️</tg-emoji>',
  warning: '<tg-emoji emoji-id="5215351548850218245">⚠️</tg-emoji>',
  web: '<tg-emoji emoji-id="5231482153228835967">🌐</tg-emoji>'
};
const defaultMessages = {
  welcome: `${premiumEmojis.welcome} Assalomu alaykum {nickname}!\n\n${premiumEmojis.bot} FUTBOLIMIZ UZ botiga xush kelibsiz! Jonli hisoblar, o‘yin tafsilotlari, tarkiblar va statistikalarni Mini App orqali kuzating. Boshlash uchun quyidagi tugmani bosing.`,
  subscriptionRequired: `${premiumEmojis.warning} Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling`,
  help: `${premiumEmojis.web} Kanal yoki guruhingizni ulash uchun botning Start xabaridagi “Kanal/guruh ulash” tugmasini bosing yoki /connect yuboring, chatni tanlang va Telegram so\'ragan admin huquqlarini tasdiqlang. Chatlaringizni /mychats bilan boshqaring; avtomatik qabulni to\'xtatib, kutilayotgan so\'rovlarni tugma bilan tasdiqlashingiz mumkin.`
};
function isAdmin(ctx) {
  const telegramId = Number(ctx.from?.id);
  if (telegramId === ADMIN_TG_ID || ctx.from?.username?.toLowerCase() === ADMIN_USERNAME) return true;
  const record = adminRegistry.get(telegramId);
  return Boolean(record?.active);
}

function isOwner(ctx) {
  return Number(ctx.from?.id) === ADMIN_TG_ID || ctx.from?.username?.toLowerCase() === ADMIN_USERNAME;
}

function hasPermission(ctx, permission) {
  if (isOwner(ctx)) return true;
  const record = adminRegistry.get(Number(ctx.from?.id));
  return Boolean(record?.active && record.permissions.includes(permission));
}

function permissionsLabel(permissions) {
  const labels = {
    broadcast: 'Xabar yuborish',
    stats: 'Statistika',
    settings: 'Obuna va efir sozlamalari',
    join_requests: 'Qo\'shilish so\'rovlari',
    admins: 'Adminlar'
  };
  return permissions.filter((permission) => adminPermissions.includes(permission))
    .map((permission) => labels[permission]).join(', ') || 'Huquq berilmagan';
}

function adminManagementKeyboard(admin) {
  const rows = adminPermissions.map((permission) => [{
    ...Markup.button.callback(
      `${admin.permissions.includes(permission) ? '✅' : '⬜'} ${permission}`,
      `admin:perm:${admin.telegramId}:${permission}`
    ),
    style: admin.permissions.includes(permission) ? 'success' : 'primary'
  }]);
  rows.push([{
    ...Markup.button.callback('🗑 Adminni o\'chirish', `admin:remove:${admin.telegramId}`),
    style: 'danger'
  }]);
  rows.push([{
    ...Markup.button.callback('⬅️ Adminlar ro\'yxati', 'admin:admins'),
    style: 'primary'
  }]);
  return Markup.inlineKeyboard(rows);
}

async function refreshAdminRegistry() {
  adminRegistry.clear();
  const admins = await Admin.find({ active: true }).lean();
  admins.forEach((admin) => adminRegistry.set(admin.telegramId, admin));
}

async function logAdminAction(ctx, action, details = '') {
  if (!ctx.from?.id) return;
  try {
    await AdminLog.create({
      adminTelegramId: Number(ctx.from.id),
      adminName: ctx.from.first_name || ctx.from.username || '',
      action,
      details
    });
  } catch (error) {
    console.error('Admin log failed:', error.message);
  }
}

function reset(ctx, leaveAdminPanel = false) {
  const telegramId = Number(ctx.from?.id);
  const panelActive = !leaveAdminPanel && isAdminPanelActive(ctx);
  if (leaveAdminPanel) activeAdminPanels.delete(telegramId);
  ctx.session = panelActive ? { adminPanelActive: true } : {};
}

function activateAdminPanel(ctx) {
  activeAdminPanels.add(Number(ctx.from?.id));
  ctx.session = { adminPanelActive: true };
}

function isAdminPanelActive(ctx) {
  const telegramId = Number(ctx.from?.id);
  return isAdmin(ctx) && (
    activeAdminPanels.has(telegramId) ||
    ctx.session?.adminPanelActive === true
  );
}

function shouldProtectContent(chatId) {
  return Number(chatId) !== ADMIN_TG_ID;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizeChannel(value) {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function inlineButtonLabel(text, entities = []) {
  const customEmojiEntities = entities.filter((entity) => entity.type === 'custom_emoji' && entity.custom_emoji_id);
  if (customEmojiEntities.length > 1) return { error: 'Tugma uchun faqat bitta premium emoji ishlatish mumkin.' };

  const customEmoji = customEmojiEntities[0];
  const label = customEmoji
    ? `${text.slice(0, customEmoji.offset)}${text.slice(customEmoji.offset + customEmoji.length)}`
    : text;
  return {
    text: label.trim(),
    ...(customEmoji ? { iconCustomEmojiId: customEmoji.custom_emoji_id } : {})
  };
}

function adminKeyboard(ctx) {
  const can = (permission) => !ctx || hasPermission(ctx, permission);
  const rows = [];
  if (can('stats')) rows.push([
    { ...Markup.button.callback('📊 Statistika', 'admin:stats'), style: 'primary' }
  ]);
  if (can('broadcast')) rows.push([
    { ...Markup.button.callback('📣 Xabar yuborish', 'admin:broadcast'), style: 'primary' }
  ]);
  if (isOwner(ctx || {})) rows.push([
    { ...Markup.button.callback('🧪 Jonli xabarni sinash', 'admin:live_test'), style: 'primary' }
  ]);
  if (can('settings')) {
    rows.push([{ ...Markup.button.callback('➕ Obuna kanalini qo\'shish', 'admin:subscription'), style: 'success' }]);
    rows.push([
      { ...Markup.button.callback('📋 Obuna kanallari', 'admin:required_list'), style: 'primary' },
      { ...Markup.button.callback('❌ Obunani o\'chirish', 'admin:subscription_off'), style: 'danger' }
    ]);
    rows.push([{ ...Markup.button.callback('📺 Jonli efirni sozlash', 'admin:stream'), style: 'primary' }]);
  }
  if (isOwner(ctx || {})) rows.push([{ ...Markup.button.callback('👥 Adminlarni boshqarish', 'admin:admins'), style: 'primary' }]);
  if (isOwner(ctx || {})) rows.push([{ ...Markup.button.callback('🧾 Admin loglari', 'admin:logs'), style: 'primary' }]);
  rows.push([{ ...Markup.button.callback('🚪 Paneldan chiqish', 'admin:exit'), style: 'danger' }]);
  return Markup.inlineKeyboard(rows);
}

function getWebAppUrl() {
  const url = String(config.webAppUrl || '').trim();
  return url || 'https://futbolimiz.uz';
}

function getMiniAppUrl() {
  const url = new URL(getWebAppUrl());
  url.pathname = '/mini-app/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getMiniAppLiveStreamUrl(streamId) {
  const url = new URL(getMiniAppUrl());
  url.searchParams.set('stream', 'live');
  if (streamId) url.searchParams.set('streamId', streamId);
  return url.toString();
}

const persistentSessionStore = {
  async get(key) {
    const record = await Session.findOne({ key }).lean();
    return record?.data;
  },
  async set(key, value) {
    await Session.findOneAndUpdate(
      { key },
      { $set: { data: value, updatedAt: new Date() } },
      { upsert: true }
    );
  },
  async delete(key) {
    await Session.deleteOne({ key });
  }
};

function formatMessage(template, ctx) {
  const nickname = ctx.from?.first_name || ctx.from?.username || 'foydalanuvchi';
  return String(template).replace(/\{(nickname|bot_username)\}/g, (match, key) => ({
    nickname,
    bot_username: config.botUsername
  }[key] ?? match));
}

function configuredMessage(key, ctx) {
  return formatMessage(data.settings.messages?.[key] || defaultMessages[key], ctx);
}

function replyOptions(replyMarkup) {
  return replyMarkup ? { parse_mode: 'HTML', reply_markup: replyMarkup } : { parse_mode: 'HTML' };
}

function welcomeMessage(ctx) {
  return configuredMessage('welcome', ctx);
}

function welcomeMarkup(ctx, liveStreams = soccerLiveStreams) {
  const webAppButton = {
    ...Markup.button.webApp('FUTBOLIMIZ UZ mini app', getMiniAppUrl()),
    style: 'primary',
    icon_custom_emoji_id: '4974264726604219680'
  };
  const rows = [];
  if (liveStreams.length) rows.push([{
    text: '🔴 Jonli Efirlar',
    callback_data: 'welcome:live_streams',
    style: 'success'
  }]);
  rows.push(
    [webAppButton],
    [{
      text: '📝 Zayafka',
      callback_data: 'welcome:applications',
      style: 'success',
      icon_custom_emoji_id: '5217943819311389632'
    }]
  );
  const bottomRow = [{
    text: 'Yordam',
    callback_data: 'help',
    style: 'danger',
    icon_custom_emoji_id: '5452069934089641166'
  }];
  if (isAdmin(ctx)) bottomRow.push({
    text: 'Admin panel',
    callback_data: 'admin:panel',
    style: 'danger',
    icon_custom_emoji_id: '5231153283288038709'
  });
  rows.push(bottomRow);
  return Markup.inlineKeyboard(rows).reply_markup;
}

function liveStreamsKeyboard(streams = soccerLiveStreams) {
  const rows = streams.map((stream) => {
    const title = Array.from(stream.title || 'Jonli efir').slice(0, 60).join('');
    return [Markup.button.webApp(`🔴 ${title}`, getMiniAppLiveStreamUrl(stream.id))];
  });
  rows.push([Markup.button.callback('⬅️ Start menyusiga qaytish', 'welcome:back')]);
  return Markup.inlineKeyboard(rows).reply_markup;
}

function liveStreamsMessage(streams = soccerLiveStreams) {
  if (!streams.length) {
    return 'Hozirda jonli efir mavjud emas.';
  }
  return '<b>🔴 Jonli efirlar</b>\n\nTomosha qilish uchun quyidagi efirlardan birini tanlang:';
}

function welcomeApplicationsMessage() {
  return `${premiumEmojis.bot} Kanal yoki guruhingizni ulash uchun “Kanal/guruh ulash” tugmasini bosing yoki /connect yuboring, so‘ng chatni tanlang. Boshqarish uchun /mychats buyrug‘ini yuboring.`;
}

function welcomeApplicationsMarkup() {
  return Markup.inlineKeyboard([
    [{
      text: '📣 Kanal/guruh ulash',
      callback_data: 'welcome:join_chat_connect',
      style: 'success',
      icon_custom_emoji_id: '5217943819311389632'
    }],
    [{
      text: '📋 Ulangan kanallar ro‘yxati',
      callback_data: 'welcome:required_list',
      style: 'success',
      icon_custom_emoji_id: '5393243708361567810'
    }],
    [{
      text: '⬅️ Start menyusiga qaytish',
      callback_data: 'welcome:back',
      style: 'danger'
    }]
  ]).reply_markup;
}

async function registerMainMenuCommands(telegram) {
  return telegram.setMyCommands(mainMenuCommands);
}

function subscriptionKeyboard(channels) {
  const rows = channels.flatMap((channel, index) => {
    const url = channel.inviteLink || (channel.username
      ? `https://t.me/${String(channel.username).replace(/^@/, '')}`
      : '');
    return url ? [Markup.button.url(`📢 ${index + 1} - kanal`, url)] : [];
  }).map((button) => [button]);
  rows.push([Markup.button.callback('✅ Tekshirish', 'check_subscription')]);
  return Markup.inlineKeyboard(rows);
}

async function getRequiredChannels() {
  const configDocument = await BotConfig.findOne({ configKey: 'main_config' }, { channels: 1 }).lean();
  return configDocument?.channels || data.settings.requiredChannels || [];
}

async function requiredSubscription(ctx) {
  if (isAdmin(ctx)) return true;
  const channels = await getRequiredChannels();
  if (!channels.length) return true;

  const notSubscribed = [];
  for (const channel of channels) {
    try {
      const member = await ctx.telegram.getChatMember(channel.id, ctx.from.id);
      if (!['creator', 'administrator', 'member'].includes(member.status)) notSubscribed.push(channel);
    } catch (error) {
      console.error('Subscription check failed:', error.response?.description || error.message);
      notSubscribed.push(channel);
    }
  }

  if (!notSubscribed.length) return true;
  await ctx.reply(configuredMessage('subscriptionRequired', ctx), replyOptions(subscriptionKeyboard(notSubscribed).reply_markup));
  return false;
}

async function checkFullAdmin(ctx, username) {
  if (!ctx?.telegram || !ctx?.from?.id) {
    throw new Error('Foydalanuvchi aniqlanmadi.');
  }

  const channelInput = String(username || '').trim();
  const isChatId = /^-?\d+$/.test(channelInput);
  const chatId = isChatId ? Number(channelInput) : null;
  if (isChatId && !Number.isSafeInteger(chatId)) {
    throw new Error('Kanal ID noto\'g\'ri. Telegramdagi raqamli ID ni yuboring.');
  }
  const normalizedUsername = isChatId ? '' : normalizeChannel(channelInput);
  const chat = await ctx.telegram.getChat(isChatId ? chatId : normalizedUsername);
  if (!chat || !['channel', 'group', 'supergroup'].includes(chat.type)) {
    throw new Error('Faqat kanal yoki guruhni majburiy obunaga qo\'shish mumkin.');
  }

  const userMember = await ctx.telegram.getChatMember(chat.id, ctx.from.id);
  if (!userMember || !['creator', 'administrator'].includes(userMember.status)) {
    throw new Error('Kanalni qo\'shish uchun kanalda admin yoki ega bo\'lishingiz kerak.');
  }

  const botInfo = await ctx.telegram.getMe();
  const member = await ctx.telegram.getChatMember(chat.id, botInfo.id);
  if (!member || !['creator', 'administrator'].includes(member.status)) {
    throw new Error('Bot kanalida administrator bo\'lishi kerak.');
  }
  let inviteLink = '';
  if (!chat.username) {
    if (member.status !== 'creator' && member.can_invite_users !== true) {
      throw new Error('Obuna havolasi yaratish uchun botga foydalanuvchilarni taklif qilish huquqini bering.');
    }
    const invite = await ctx.telegram.createChatInviteLink(chat.id);
    inviteLink = invite.invite_link;
  }

  return {
    id: chat.id,
    title: chat.title || normalizedUsername || String(chat.id),
    username: chat.username ? `@${chat.username}` : '',
    type: chat.type,
    ...(inviteLink ? { inviteLink } : {})
  };
}

async function verifySelectedJoinRequestChat(ctx, chatId, actorId) {
  const chat = await ctx.telegram.getChat(chatId);
  const botInfo = await ctx.telegram.getMe();
  await verifyJoinRequestChat({ telegram: ctx.telegram, botInfo }, chat, actorId);
  return chat;
}

function createRequiredChatRequestButton(text, requestId, chatIsChannel, purpose) {
  const canDeleteMessages = purpose === 'join_requests';
  const administratorRights = {
    is_anonymous: false,
    can_manage_chat: true,
    can_delete_messages: canDeleteMessages,
    can_manage_video_chats: false,
    can_restrict_members: false,
    can_promote_members: false,
    can_change_info: false,
    can_invite_users: true,
    ...(chatIsChannel ? { can_post_messages: false } : {})
  };
  return {
    text,
    request_chat: {
      request_id: requestId,
      chat_is_channel: chatIsChannel,
      bot_is_member: false,
      user_administrator_rights: { ...administratorRights },
      bot_administrator_rights: { ...administratorRights }
    }
  };
}

function createRequiredChatPickerKeyboard(channelRequestId, groupRequestId, purpose = 'required_subscription') {
  return {
    keyboard: [
      [createRequiredChatRequestButton('📢 Kanal tanlash', channelRequestId, true, purpose)],
      [createRequiredChatRequestButton('👥 Guruh tanlash', groupRequestId, false, purpose)],
      [{ text: '❌ Bekor qilish' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
    input_field_placeholder: 'Kanal yoki guruhni tanlang'
  };
}

function clearChatSelections(userId) {
  for (const [requestId, request] of pendingChatSelections) {
    if (request.userId === userId) pendingChatSelections.delete(requestId);
  }
}

async function startChatPicker(ctx, purpose) {
  const userId = Number(ctx.from.id);
  clearChatSelections(userId);

  let channelRequestId;
  let groupRequestId;
  do {
    channelRequestId = crypto.randomInt(1, 2_147_483_647);
  } while (pendingChatSelections.has(channelRequestId));
  pendingChatSelections.set(channelRequestId, {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    purpose
  });
  do {
    groupRequestId = crypto.randomInt(1, 2_147_483_647);
  } while (groupRequestId === channelRequestId || pendingChatSelections.has(groupRequestId));
  pendingChatSelections.set(groupRequestId, {
    userId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    purpose
  });

  try {
    await ctx.telegram.sendMessage(
      ctx.chat.id,
      'Kanal yoki guruhni tanlang. Telegram botni kerakli admin huquqlari bilan qo\'shishni taklif qiladi.',
      { reply_markup: createRequiredChatPickerKeyboard(channelRequestId, groupRequestId, purpose) }
    );
  } catch (error) {
    clearChatSelections(userId);
    throw error;
  }
}

async function openJoinRequestChatPicker(ctx) {
  try {
    return await startChatPicker(ctx, 'join_requests');
  } catch (error) {
    console.error('Join-request chat picker could not be sent:', error.response?.description || error.message);
    return ctx.reply(`Kanal yoki guruh tanlash oynasini ochib bo'lmadi: ${error.response?.description || error.message}`);
  }
}

async function handleSharedRequiredChat(ctx, sharedChat) {
  const requesterId = Number(ctx.from?.id);
  const request = pendingChatSelections.get(sharedChat.request_id);
  if (!request || request.userId !== requesterId) return;
  if (request.purpose === 'required_subscription' && (!isAdmin(ctx) || !hasPermission(ctx, 'settings'))) {
    clearChatSelections(requesterId);
    await ctx.telegram.sendMessage(requesterId, 'Ruxsat yo\'q.', {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }
  if (request.expiresAt <= Date.now()) {
    clearChatSelections(requesterId);
    await ctx.telegram.sendMessage(requesterId, 'Tanlash muddati tugadi. Admin paneldan qaytadan boshlang.', {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  clearChatSelections(requesterId);
  try {
    const chat = request.purpose === 'required_subscription'
      ? await checkFullAdmin({ telegram: ctx.telegram, from: ctx.from }, sharedChat.chat_id)
      : await verifySelectedJoinRequestChat(ctx, sharedChat.chat_id, requesterId);

    if (request.purpose === 'required_subscription') {
      if (!data.settings.requiredChannels.some((item) => item.id === chat.id)) {
        const currentChannels = data.settings.requiredChannels;
        data.settings.requiredChannels = [...currentChannels, chat];
        try {
          await saveSettings();
        } catch (error) {
          data.settings.requiredChannels = currentChannels;
          throw error;
        }
      }
      await ctx.telegram.sendMessage(
        requesterId,
        `✅ “${chat.title}” majburiy obuna ${['group', 'supergroup'].includes(chat.type) ? 'guruhi' : 'kanali'} sifatida qo'shildi.`,
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    await JoinRequestChat.findOneAndUpdate(
      { chatId: chat.id },
      {
        $set: {
          title: chat.title || chat.username || String(chat.id),
          type: chat.type,
          username: chat.username ? `@${chat.username}` : '',
          linkedBy: requesterId
        },
        $setOnInsert: { paused: false }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    joinRequestChatIds.add(String(chat.id));
    await ctx.telegram.sendMessage(
      requesterId,
      `✅ “${chat.title || chat.username || chat.id}” chat ulandi. Qo'shilish so'rovlarini /mychats orqali boshqarishingiz mumkin.`,
      { reply_markup: { remove_keyboard: true } }
    );
  } catch (error) {
    console.error(`Chat setup failed for ${sharedChat.chat_id}:`, error.response?.description || error.message);
    await ctx.telegram.sendMessage(
      requesterId,
      `Chatni ulab bo'lmadi: ${error.message || 'xatolik yuz berdi'}. Bot tanlangan chatda kerakli admin huquqlariga ega ekanini tekshiring.`,
      { reply_markup: { remove_keyboard: true } }
    );
  }
}

async function saveSettings() {
  await BotConfig.findOneAndUpdate(
    { configKey: 'main_config' },
    { $set: { channels: data.settings.requiredChannels, 'settings.messages': data.settings.messages } },
    { upsert: true }
  );
}

async function saveSoccerLiveStream(ctx, stream) {
  const savedStream = { ...stream, id: crypto.randomUUID() };
  const updatedStreams = [...soccerLiveStreams, savedStream];
  await BotConfig.findOneAndUpdate(
    { configKey: 'main_config' },
    { $set: { 'settings.liveStreams': updatedStreams, 'settings.liveStream': null } },
    { upsert: true }
  );
  soccerLiveStreams = updatedStreams;
  await logAdminAction(
    ctx,
    'mini_app_live_stream_updated',
    `${savedStream.type}${savedStream.match ? `:${savedStream.match.leagueId}:${savedStream.match.id}` : ''}`
  );
  return savedStream;
}

async function hydrateSettings() {
  await mongoConnection;
  const admins = await Admin.find({ active: true }).lean();
  adminRegistry.clear();
  admins.forEach((admin) => adminRegistry.set(admin.telegramId, admin));
  const linkedChats = await JoinRequestChat.find({}, { chatId: 1 }).lean();
  joinRequestChatIds.clear();
  linkedChats.forEach((chat) => joinRequestChatIds.add(String(chat.chatId)));
  let configDocument = await BotConfig.findOne({ configKey: 'main_config' }).lean();
  if (!configDocument) {
    configDocument = await BotConfig.create({ configKey: 'main_config', channels: [], settings: {} });
    configDocument = configDocument.toObject();
  }
  data.settings.requiredChannels = configDocument.channels || [];
  data.settings.messages = { ...defaultMessages };
  const savedLiveStreams = configDocument.settings?.liveStreams;
  const savedLiveStream = configDocument.settings?.liveStream;
  soccerLiveStreams = normalizeSavedSoccerLiveStreams(savedLiveStreams, savedLiveStream);
  if ((Array.isArray(savedLiveStreams) && savedLiveStreams.length !== soccerLiveStreams.length) ||
      (savedLiveStream && !Array.isArray(savedLiveStreams) && !soccerLiveStreams.length)) {
    console.warn('Saved Mini App live stream URL is invalid and was ignored.');
  }
}

async function ensureUser(ctx) {
  const telegramId = Number(ctx.from.id);
  const existingUser = await User.findOne({ telegramId }).lean();
  const now = new Date();
  const userData = {
    username: ctx.from.username || '',
    nickname: ctx.from.first_name || ctx.from.last_name || '',
    lastActiveAt: now
  };
  if (existingUser) {
    await User.updateOne({ telegramId }, { $set: { ...userData, joinedAt: existingUser.joinedAt || now } });
    return { user: { ...existingUser, ...userData }, isNew: false };
  }
  try {
    const user = await User.create({ telegramId, ...userData, joinedAt: now });
    return { user: user.toObject(), isNew: true };
  } catch (error) {
    if (error.code !== 11000) throw error;
    await User.updateOne({ telegramId }, { $set: userData });
    return { user: await User.findOne({ telegramId }).lean(), isNew: false };
  }
}

async function updateExistingUserActivity(ctx) {
  if (!ctx.from?.id) return;
  await User.updateOne(
    { telegramId: Number(ctx.from.id) },
    {
      $set: {
        username: ctx.from.username || '',
        nickname: ctx.from.first_name || ctx.from.last_name || '',
        lastActiveAt: new Date()
      }
    }
  );
}

async function notifyNewSubscriber(ctx) {
  if (isAdmin(ctx)) return;

  const [count, admins] = await Promise.all([
    User.countDocuments(),
    Admin.find({ active: true }).lean()
  ]);

  const nickname = escapeHtml(ctx.from.first_name || ctx.from.last_name || ctx.from.username || 'foydalanuvchi');
  const profileLink = `<a href="tg://user?id=${Number(ctx.from.id)}">${nickname}</a>`;
  const message = `Botga yangi obunachi qo'shildi: ${profileLink}\nObunachilar soni: ${count}`;
  const adminIds = [...new Set([
    Number(ADMIN_TG_ID),
    ...admins.map((admin) => Number(admin.telegramId)),
    ...Array.from(adminRegistry.values()).map((admin) => Number(admin.telegramId))
  ].filter((id) => Number.isFinite(id) && id > 0))];

  if (!adminIds.length) return;

  await Promise.allSettled(
    adminIds.map(async (adminId) => {
      try {
        await bot.telegram.sendMessage(adminId, message, {
          parse_mode: 'HTML',
          protect_content: false
        });
      } catch (error) {
        console.error(`Admin notification failed for ${adminId}:`, error.response?.description || error.message);
      }
    })
  );
}

function broadcastKeyboard() {
  return Markup.inlineKeyboard([
    [{ ...Markup.button.callback('➡️ Rasmsiz davom etish', 'broadcast:no_media'), style: 'primary' }],
    [{ ...Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel'), style: 'danger' }]
  ]);
}

function broadcastButtonKeyboard() {
  return Markup.inlineKeyboard([
    [{ ...Markup.button.callback('➕ Yana tugma qo\'shish', 'broadcast:add_button'), style: 'success' }],
    [{ ...Markup.button.callback('👁 Preview', 'broadcast:preview'), style: 'primary' }],
    [{ ...Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel'), style: 'danger' }]
  ]);
}

function broadcastButtonTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      { ...Markup.button.callback('🔗 Odatdagi link', 'broadcast:type:url'), style: 'primary' },
      { ...Markup.button.callback('🚀 Mini App', 'broadcast:type:web_app'), style: 'success' }
    ],
    [{ ...Markup.button.callback('⚙️ Bot buyrug‘i', 'broadcast:type:command'), style: 'primary' }],
    [{ ...Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel'), style: 'danger' }]
  ]);
}

function broadcastCommandKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('/start', 'broadcast:command:start'),
      Markup.button.callback('/app', 'broadcast:command:app')
    ],
    [
      Markup.button.callback('/live', 'broadcast:command:live'),
      Markup.button.callback('/connect', 'broadcast:command:connect')
    ],
    [
      Markup.button.callback('/mychats', 'broadcast:command:mychats'),
      Markup.button.callback('/help', 'broadcast:command:help')
    ],
    [Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel')]
  ]);
}

function buildBroadcastInlineButton(text, url, kind = 'url', style, iconCustomEmojiId) {
  if (kind === 'command') {
    return {
      text,
      callback_data: `user_command:${url}`,
      style,
      ...(iconCustomEmojiId ? { icon_custom_emoji_id: iconCustomEmojiId } : {})
    };
  }
  const resolvedUrl = kind === 'web_app' ? (url || getWebAppUrl()) : url;
  const button = kind === 'web_app' ? Markup.button.webApp(text, resolvedUrl) : Markup.button.url(text, resolvedUrl);
  return {
    ...button,
    style,
    ...(iconCustomEmojiId ? { icon_custom_emoji_id: iconCustomEmojiId } : {})
  };
}

function broadcastConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [{ ...Markup.button.callback('📤 Yuborish', 'broadcast:send'), style: 'success' }],
    [{ ...Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel'), style: 'danger' }]
  ]);
}

function broadcastColorKeyboard() {
  return Markup.inlineKeyboard([
    [
      { ...Markup.button.callback('🔵 Ko\'k', 'broadcast:color:blue'), style: 'primary' },
      { ...Markup.button.callback('🟢 Yashil', 'broadcast:color:green'), style: 'success' }
    ],
    [{ ...Markup.button.callback('🔴 Qizil', 'broadcast:color:red'), style: 'danger' }]
  ]);
}

function joinWelcomeButtonTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 Link', 'join_welcome:type:url'), Markup.button.callback('🚀 Mini App', 'join_welcome:type:web_app')],
    [Markup.button.callback('❌ Bekor qilish', 'join_welcome:cancel')]
  ]);
}

function broadcastExtra(broadcast, chatId) {
  const replyMarkup = broadcast.buttons?.length
    ? Markup.inlineKeyboard(broadcast.buttons).reply_markup
    : undefined;
  const commonExtra = replyMarkup ? { reply_markup: replyMarkup } : {};
  commonExtra.protect_content = shouldProtectContent(chatId);
  const textExtra = {
    ...commonExtra,
    ...(broadcast.captionEntities?.length
      ? { entities: broadcast.captionEntities }
      : { parse_mode: 'HTML' })
  };
  const mediaExtra = {
    ...commonExtra,
    ...(broadcast.captionEntities?.length
      ? { caption_entities: broadcast.captionEntities }
      : { parse_mode: 'HTML' })
  };
  return { textExtra, mediaExtra };
}

async function sendBroadcastMessage(chatId, broadcast) {
  const { textExtra, mediaExtra } = broadcastExtra(broadcast, chatId);
  if (broadcast.mediaType === 'photo') {
    return bot.telegram.sendPhoto(chatId, broadcast.media, { ...mediaExtra, caption: broadcast.caption || undefined });
  }
  if (broadcast.mediaType === 'video') {
    return bot.telegram.sendVideo(chatId, broadcast.media, { ...mediaExtra, caption: broadcast.caption || undefined });
  }
  if (broadcast.mediaType === 'animation') {
    return bot.telegram.sendAnimation(chatId, broadcast.media, { ...mediaExtra, caption: broadcast.caption || undefined });
  }
  return bot.telegram.sendMessage(chatId, broadcast.caption || ' ', textExtra);
}

async function previewBroadcast(ctx) {
  const broadcast = ctx.session?.broadcast;
  if (!broadcast) return ctx.reply('Xabar yuborish jarayoni topilmadi.');
  try {
    await sendBroadcastMessage(ctx.from.id, broadcast);
    broadcast.previewed = true;
    return ctx.reply('Preview yuborildi. Tekshirib, yuborishni tasdiqlang.', broadcastConfirmKeyboard());
  } catch (error) {
    return ctx.reply(`Preview yuborilmadi: ${error.response?.description || error.message}`);
  }
}

async function sendBroadcast(ctx) {
  const broadcast = ctx.session?.broadcast;
  if (!broadcast) return ctx.reply('Xabar yuborish jarayoni topilmadi.');
  const users = await User.find({}, { telegramId: 1 }).lean();
  const log = await Broadcast.create({ total: users.length });
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let removed = 0;
  let processed = 0;
  let nextUserIndex = 0;
  let nextSendAt = 0;
  let progressMessageId = null;
  let progressUpdateChain = Promise.resolve();
  const sendIntervalMs = 40;
  const workerCount = Math.min(100, users.length);

  function getProgressText() {
    return `Xabar yuborilmoqda: ${processed} / ${users.length}\nYetib bordi: ${sent}\nXatolik: ${failed}`;
  }

  async function waitForSendSlot() {
    const now = Date.now();
    const waitMs = Math.max(0, nextSendAt - now);
    nextSendAt = Math.max(now, nextSendAt) + sendIntervalMs;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async function updateProgress() {
    const text = getProgressText();
    progressUpdateChain = progressUpdateChain.then(async () => {
      if (!progressMessageId) return;
      await ctx.telegram.editMessageText(ctx.from.id, progressMessageId, undefined, text);
    }).catch((error) => {
      console.error('Broadcast progress update failed:', error.response?.description || error.message);
    });
    await progressUpdateChain;
  }

  async function sendToUser(user) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await waitForSendSlot();
      try {
        await sendBroadcastMessage(user.telegramId, broadcast);
        sent += 1;
        return;
      } catch (error) {
        const errorCode = error.response?.error_code;
        const retryAfter = Number(error.response?.parameters?.retry_after || error.parameters?.retry_after);
        if (errorCode === 429 && Number.isFinite(retryAfter) && retryAfter > 0 && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          continue;
        }
        failed += 1;
        if (errorCode === 403) blocked += 1;
        if (await removeUndeliverableUser(user.telegramId, error, 'broadcast')) removed += 1;
        console.error(`Broadcast to ${user.telegramId} failed:`, error.response?.description || error.message);
        return;
      }
    }
  }

  async function worker() {
    while (nextUserIndex < users.length) {
      const user = users[nextUserIndex];
      nextUserIndex += 1;
      await sendToUser(user);
      processed += 1;
      if (processed % 25 === 0 || processed === users.length) await updateProgress();
    }
  }

  try {
    const progressMessage = await ctx.telegram.sendMessage(ctx.from.id, getProgressText(), { protect_content: false });
    progressMessageId = progressMessage.message_id;
  } catch (error) {
    console.error('Broadcast progress notification failed:', error.response?.description || error.message);
  }

  const startedAt = Date.now();
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const durationSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
  await Broadcast.updateOne({ _id: log._id }, { $set: { sent, failed, blocked, removed } });
  return {
    total: users.length,
    sent,
    failed,
    blocked,
    removed,
    durationSeconds,
    messagesPerSecond: sent / durationSeconds
  };
}

async function adminStats(ctx) {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const [subscribers, newUsersDaily, newUsersWeekly, activeUsersDaily, activeUsersWeekly, broadcasts, linkedChats] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ joinedAt: { $gte: dayAgo } }),
    User.countDocuments({ joinedAt: { $gte: weekAgo } }),
    User.countDocuments({ lastActiveAt: { $gte: dayAgo } }),
    User.countDocuments({ lastActiveAt: { $gte: weekAgo } }),
    Broadcast.aggregate([{ $group: { _id: null, total: { $sum: 1 }, sent: { $sum: '$sent' }, failed: { $sum: '$failed' }, blocked: { $sum: '$blocked' }, removed: { $sum: '$removed' } } }]),
    JoinRequestChat.countDocuments()
  ]);
  const broadcastStats = broadcasts[0] || { total: 0, sent: 0, failed: 0, blocked: 0, removed: 0 };
  return ctx.reply(`<tg-emoji emoji-id="5244825199278311613">📊</tg-emoji> Bot statistikasi\n\n` +
    `<blockquote>Obunachilar jami: ${subscribers}\nYangi userlar (24 soat / 7 kun): ${newUsersDaily} / ${newUsersWeekly}\n` +
    `Faol userlar (24 soat / 7 kun): ${activeUsersDaily} / ${activeUsersWeekly}\n` +
    `Jami ulangan chatlar: ${linkedChats}</blockquote>\n\n` +
    `<blockquote>Broadcastlar: ${broadcastStats.total}\nYetib borgan: ${broadcastStats.sent}\nBloklagan: ${broadcastStats.blocked}\nBazadan o'chirilgan: ${broadcastStats.removed}\nXatolik: ${broadcastStats.failed}</blockquote>`,
    replyOptions(adminKeyboard(ctx).reply_markup));
}

async function handleStart(ctx) {
  reset(ctx, true);
  const registration = await ensureUser(ctx);
  if (registration.isNew) {
    try {
      await notifyNewSubscriber(ctx);
    } catch (error) {
      console.error('New subscriber notification failed:', error.response?.description || error.message);
    }
  }
  if (!(await requiredSubscription(ctx))) return;
  return ctx.reply(welcomeMessage(ctx), replyOptions(welcomeMarkup(ctx)));
}

bot.use(async (ctx, next) => {
  if (ctx.chatJoinRequest || ctx.myChatMember) return next();
  if (ctx.chat && ctx.chat.type !== 'private' && !isChatLinkCommand(getChatCommand(ctx))) return;
  return next();
});

bot.use(session({ store: persistentSessionStore }));

bot.use(async (ctx, next) => {
  const reply = ctx.reply.bind(ctx);
  ctx.reply = async (text, extra = {}) => {
    const options = addNavigationControls(extra);
    options.protect_content = !isAdmin(ctx);
    if (ctx.session) {
      const navigation = ctx.session.navigation || { history: [], last: null };
      if (!ctx.session.skipNavigationHistory) {
        if (navigation.last) navigation.history = [...navigation.history, navigation.last].slice(-12);
        const sessionSnapshot = { ...ctx.session };
        delete sessionSnapshot.navigation;
        delete sessionSnapshot.skipNavigationHistory;
        navigation.last = { text, extra: options, session: sessionSnapshot };
      } else {
        delete ctx.session.skipNavigationHistory;
      }
      ctx.session.navigation = navigation;
    }
    if (ctx.callbackQuery) return editCallbackMessage(ctx, text, options);
    return reply(text, options);
  };
  return next();
});

bot.action('navigation:back', async (ctx) => {
  await ctx.answerCbQuery();
  const history = ctx.session?.navigation?.history || [];
  const previous = history.pop();
  if (!previous) {
    reset(ctx);
    if (isAdminPanelActive(ctx)) return ctx.reply('Admin panel', adminKeyboard(ctx));
    return ctx.reply(welcomeMessage(ctx), replyOptions(welcomeMarkup(ctx)));
  }
  ctx.session = {
    ...previous.session,
    navigation: { history, last: previous },
    skipNavigationHistory: true
  };
  return ctx.reply(previous.text, previous.extra || {});
});

bot.start(handleStart);

bot.use(async (ctx, next) => {
  const isChatCommand = ctx.chat && ctx.chat.type !== 'private' && isChatLinkCommand(getChatCommand(ctx));
  if (ctx.chatJoinRequest || ctx.myChatMember || isChatCommand) return next();
  if (/^\/(?:connect|disconnect|mychats)(?:@\w+)?(?:\s|$)/i.test(ctx.message?.text || '') ||
      /^(?:join_chat:|join_request:)/.test(ctx.callbackQuery?.data || '')) return next();
  if (ctx.from && ctx.message?.text !== '/start') await updateExistingUserActivity(ctx);
  if (ctx.callbackQuery?.data === 'check_subscription') return next();
  if (ctx.callbackQuery?.data && isAdmin(ctx) &&
      /^(?:admin:|broadcast:)/.test(ctx.callbackQuery.data) &&
      ctx.callbackQuery.data !== 'admin:panel' && !isAdminPanelActive(ctx)) {
    await ctx.answerCbQuery('Avval /admin orqali panelni oching.', { show_alert: true });
    return;
  }
  if (ctx.callbackQuery?.data && isAdmin(ctx)) {
    const permission = permissionForCallback(ctx.callbackQuery.data);
    if (permission && !hasPermission(ctx, permission)) {
      await ctx.answerCbQuery('Bu amal uchun sizda huquq yo\'q.', { show_alert: true });
      return;
    }
  }
  if (isAdmin(ctx)) return next();
  if (await requiredSubscription(ctx)) return next();
});

bot.action(/^user_command:(start|app|live|connect|mychats|help)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const command = ctx.match[1];
  const originalReply = ctx.reply;
  ctx.reply = async (text, extra = {}) => ctx.telegram.sendMessage(
    ctx.from.id,
    text,
    { ...addNavigationControls(extra), protect_content: !isAdmin(ctx) }
  );
  try {
    if (command === 'start') return await handleStart(ctx);
    if (command === 'app') {
      return await ctx.reply(
        'Mini Appni ochish uchun quyidagi tugmani bosing:',
        Markup.inlineKeyboard([[
          Markup.button.webApp('FUTBOLIMIZ UZ mini app', getMiniAppUrl())
        ]])
      );
    }
    if (command === 'live') {
      return await ctx.reply(liveStreamsMessage(), replyOptions(liveStreamsKeyboard()));
    }
    if (command === 'connect') return await openJoinRequestChatPicker(ctx);
    if (command === 'mychats') return await showJoinRequestChats(ctx);
    return await ctx.reply(configuredMessage('help', ctx), replyOptions());
  } finally {
    ctx.reply = originalReply;
  }
});

bot.command('app', async (ctx) => {
  return ctx.reply(
    'Mini Appni ochish uchun quyidagi tugmani bosing:',
    Markup.inlineKeyboard([[
      Markup.button.webApp('FUTBOLIMIZ UZ mini app', getMiniAppUrl())
    ]])
  );
});

bot.command('live', async (ctx) => {
  if (ctx.chat?.type !== 'private') {
    return ctx.reply('Jonli efirlarni ko‘rish uchun botning shaxsiy chatida /live buyrug‘ini yuboring.');
  }
  return ctx.reply(
    liveStreamsMessage(),
    replyOptions(liveStreamsKeyboard())
  );
});

bot.command('connect', async (ctx) => {
  const chat = ctx.chat;
  const argument = getChatCommand(ctx).replace(/^\/connect(?:@\w+)?\s*/i, '').trim();
  if (chat?.type === 'private') {
    return openJoinRequestChatPicker(ctx);
  }
  if (!chat || !['group', 'supergroup'].includes(chat.type)) {
    return;
  }
  if (/^\d{6}$/.test(argument)) return handleJoinRequestConnectCode(ctx, getChatCommand(ctx));
  return replyPrivatelyAndDelete(ctx, chat, ctx.message.message_id, ctx.from?.id,
    'Botning shaxsiy chatida /connect yuborib 6 xonali kod oling, keyin guruhda /connect 123456 yuboring.');
});

bot.command('disconnect', async (ctx) => {
  const chat = ctx.chat;
  const argument = getChatCommand(ctx).replace(/^\/disconnect(?:@\w+)?\s*/i, '').trim();
  if (chat?.type === 'private' && argument) {
    const chatId = Number(argument);
    if (!Number.isSafeInteger(chatId)) {
      return ctx.reply('Shaxsiy chatda uzish uchun chat ID yuboring. /mychats orqali ham uzishingiz mumkin.');
    }
    const linkedChat = await JoinRequestChat.findOne({ chatId }).lean();
    if (!linkedChat) return ctx.reply('Ulangan chat topilmadi.');
    return handleJoinChatCommand(ctx, getChatCommand(ctx), {
      id: linkedChat.chatId,
      title: linkedChat.title,
      type: linkedChat.type,
      username: linkedChat.username?.replace(/^@/, '')
    }, ctx.from?.id);
  }
  if (!chat || !['group', 'supergroup'].includes(chat.type)) {
    return ctx.reply('Guruhda /disconnect yuboring yoki /mychats orqali chatni tanlang.');
  }
  return handleJoinChatCommand(ctx, getChatCommand(ctx), chat, ctx.from?.id);
});

bot.command('mychats', showJoinRequestChats);
bot.command('help', (ctx) => ctx.reply(configuredMessage('help', ctx), replyOptions()));

bot.on('channel_post', handleChannelLinkCommand);

bot.on('my_chat_member', async (ctx) => {
  const update = ctx.myChatMember;
  const chatId = update?.chat.id;
  if (!chatId) return;

  const member = update.new_chat_member;
  const isChannelAdmin = update.chat.type === 'channel' &&
    ['creator', 'administrator'].includes(member.status);
  if (isChannelAdmin) {
    try {
      const fields = {
        title: update.chat.title || update.chat.username || String(chatId),
        type: 'channel',
        username: update.chat.username ? `@${update.chat.username}` : ''
      };
      const insertFields = { paused: false };
      if (update.from?.id) insertFields.linkedBy = update.from.id;
      await JoinRequestChat.findOneAndUpdate(
        { chatId },
        { $set: fields, $setOnInsert: insertFields },
        { upsert: true, setDefaultsOnInsert: true }
      );
      joinRequestChatIds.add(String(chatId));
      if (member.status === 'administrator' &&
          member.can_invite_users !== true &&
          update.from?.id) {
        try {
          await ctx.telegram.sendMessage(
            update.from.id,
            `Bot kanalga avtomatik ulandi, ammo qo'shilish so'rovlarini qabul qilish uchun bot adminiga “Foydalanuvchilarni taklif qilish” huquqini ham yoqing.`
          );
        } catch (error) {
          console.error(`Could not notify channel admin ${update.from.id} about missing invite permission:`, error.response?.description || error.message);
        }
      }
      return;
    } catch (error) {
      console.error(`Automatic channel connection failed for ${chatId}:`, error.response?.description || error.message);
      return;
    }
  }
  if (!joinRequestChatIds.has(String(chatId))) return;

  const linkedChat = await JoinRequestChat.findOne({ chatId }).lean();
  if (!linkedChat) {
    joinRequestChatIds.delete(String(chatId));
    return;
  }
  const hasRequiredRights = member.status === 'creator' ||
    (member.status === 'administrator' &&
      member.can_invite_users === true &&
      (update.chat.type === 'channel' || member.can_delete_messages === true));
  if (hasRequiredRights) return;

  await JoinRequestChat.deleteOne({ chatId });
  joinRequestChatIds.delete(String(chatId));
  console.warn(`Join-request processing disabled for chat ${chatId}: bot lost administrator invite or delete permission.`);
});

bot.action('admin:join_chats', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'join_requests')) return ctx.reply('Ruxsat yo\'q.');
  return ctx.reply('Ulangan chatlar soni Statistika bo\'limida ko\'rsatiladi.', adminKeyboard(ctx));
});

bot.action('join_chat:list', async (ctx) => {
  await ctx.answerCbQuery();
  return showJoinRequestChats(ctx);
});

bot.action(/^join_chat:open:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = Number(ctx.match[1]);
  const chat = await isChatAdministrator(ctx, chatId);
  if (!chat) return ctx.reply(chat === null ? 'Ulangan chat topilmadi.' : 'Bu chatni boshqarish uchun uning administratori bo\'lishingiz kerak.');
  const pendingCount = await PendingJoinRequest.countDocuments({ chatId });
  return ctx.reply(
    `${chat.title || chat.username || chat.chatId}\nHolat: ${chat.paused ? '⏸ To\'xtatilgan' : '▶️ Avtomatik qabul yoqilgan'}`,
    chatManagementKeyboard(chat, pendingCount)
  );
});

bot.action(/^join_chat:(pause|resume):(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = Number(ctx.match[2]);
  const chat = await isChatAdministrator(ctx, chatId);
  if (!chat) return ctx.reply(chat === null ? 'Ulangan chat topilmadi.' : 'Bu chatni boshqarish uchun uning administratori bo\'lishingiz kerak.');
  const paused = ctx.match[1] === 'pause';
  const updatedChat = await JoinRequestChat.findOneAndUpdate(
    { chatId },
    { $set: { paused } },
    { returnDocument: 'after' }
  ).lean();
  return ctx.reply(
    paused
      ? '⏸ Avtomatik qabul to\'xtatildi. Yangi so\'rovlar kutilayotganlar ro\'yxatiga tushadi.'
      : '▶️ Avtomatik qabul davom ettirildi. To\'xtatilgan vaqtda yig\'ilgan so\'rovlar ro\'yxatda qoladi; ularni alohida tasdiqlashingiz mumkin.',
    chatManagementKeyboard(updatedChat, await PendingJoinRequest.countDocuments({ chatId }))
  );
});

bot.action(/^join_chat:edit_welcome:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = Number(ctx.match[1]);
  const chat = await isChatAdministrator(ctx, chatId);
  if (!chat) return ctx.reply('Chat topilmadi yoki bu chatni boshqarish huquqingiz yo\'q.');
  ctx.session = {
    step: 'join_welcome_media',
    joinRequestChatId: chatId,
    joinWelcomeDraft: {
      message: chat.welcomeMessage || 'Sizni tez orada qabul qilamiz!',
      entities: chat.welcomeEntities || [],
      mediaType: chat.welcomeMediaType || '',
      mediaFileId: chat.welcomeMediaFileId || '',
      buttons: chat.welcomeButtons || []
    }
  };
  return ctx.reply(
    'Ariza yuborganlarga boradigan salomlashuvni sozlang. Media yuboring yoki quyidagi tugmalardan birini tanlang. ' +
    'Kanal/guruh nomi boshiga avtomatik qo\'shiladi; premium emoji matnda saqlanadi.',
    joinWelcomeMediaKeyboard(ctx.session.joinWelcomeDraft)
  );
});

bot.action(/^join_welcome:(keep_media|no_media)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_media') {
    return ctx.reply('Salomlashuv tahrirlash jarayoni topilmadi.');
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
  }
  if (ctx.match[1] === 'no_media') {
    ctx.session.joinWelcomeDraft.mediaType = '';
    ctx.session.joinWelcomeDraft.mediaFileId = '';
  }
  ctx.session.step = 'join_welcome_text';
  return ctx.reply(
    'Salomlashuv matnini yuboring (1–4096 belgi). Premium emoji ishlatishingiz mumkin. ' +
    'Matn xabari Telegram yuborgan format va emoji ma\'lumotlari bilan saqlanadi.'
  );
});

bot.action('join_welcome:add_button', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_controls') {
    return ctx.reply('Avval salomlashuv matnini kiriting.');
  }
  if (ctx.session.joinWelcomeDraft.buttons.length >= 8) {
    return ctx.reply('Ko\'pi bilan 8 ta havolali tugma qo\'shish mumkin.');
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
  }
  ctx.session.step = 'join_welcome_button_text';
  return ctx.reply('Tugma nomini yuboring (1–64 belgi). Premium emoji yuborsangiz, u tugma ikonkasiga aylanadi:');
});

bot.action(/^join_welcome:type:(url|web_app)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_button_type') {
    return ctx.reply('Tugma turi tanlash bosqichi topilmadi.');
  }
  ctx.session.pendingJoinWelcomeButtonType = ctx.match[1];
  if (ctx.match[1] === 'web_app') {
    ctx.session.pendingJoinWelcomeButtonUrl = getWebAppUrl();
    ctx.session.step = 'join_welcome_button_color';
    return ctx.reply('Tugma rangini tanlang:', joinWelcomeColorKeyboard());
  }
  ctx.session.step = 'join_welcome_button_url';
  return ctx.reply('Tugma havolasini yuboring (http:// yoki https://):');
});

bot.action('join_welcome:clear_buttons', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_controls') {
    return ctx.reply('Salomlashuv tahrirlash jarayoni topilmadi.');
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
  }
  ctx.session.joinWelcomeDraft.buttons = [];
  return ctx.reply('Havolali tugmalar olib tashlandi.', joinWelcomeDraftKeyboard());
});

bot.action(/^join_welcome:color:(blue|green|red)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_button_color') {
    return ctx.reply('Tugma rangini tanlash bosqichi topilmadi.');
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
  }
  const style = { blue: 'primary', green: 'success', red: 'danger' }[ctx.match[1]];
  const button = ctx.session.pendingJoinWelcomeButtonType === 'web_app'
    ? Markup.button.webApp(ctx.session.pendingJoinWelcomeButtonText, ctx.session.pendingJoinWelcomeButtonUrl || getWebAppUrl())
    : Markup.button.url(ctx.session.pendingJoinWelcomeButtonText, ctx.session.pendingJoinWelcomeButtonUrl);
  ctx.session.joinWelcomeDraft.buttons.push([{
    ...button,
    style,
    ...(ctx.session.pendingJoinWelcomeButtonEmojiId
      ? { icon_custom_emoji_id: ctx.session.pendingJoinWelcomeButtonEmojiId }
      : {})
  }]);
  delete ctx.session.pendingJoinWelcomeButtonText;
  delete ctx.session.pendingJoinWelcomeButtonUrl;
  delete ctx.session.pendingJoinWelcomeButtonType;
  delete ctx.session.pendingJoinWelcomeButtonEmojiId;
  ctx.session.step = 'join_welcome_controls';
  return ctx.reply('Tugma qo\'shildi. Preview ko\'ring yoki saqlang.', joinWelcomeDraftKeyboard());
});

bot.action('join_welcome:preview', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_controls') {
    return ctx.reply('Avval salomlashuv matnini kiriting.');
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
  }
  try {
    await sendJoinWelcomeMessage(ctx.telegram, ctx.from.id, chat, ctx.session.joinWelcomeDraft);
    return ctx.reply('Yuqoridagi xabar — preview. Saqlash tugmasini bossangiz, shu chatga kelgan barcha ariza beruvchilarga yuboriladi.', joinWelcomeDraftKeyboard());
  } catch (error) {
    console.error(`Join-request welcome preview failed for chat ${chat.chatId}:`, error.response?.description || error.message);
    return ctx.reply(`Preview yuborilmadi: ${error.response?.description || error.message}`, joinWelcomeDraftKeyboard());
  }
});

bot.action('join_welcome:save', async (ctx) => {
  await ctx.answerCbQuery();
  if (!ctx.session?.joinWelcomeDraft || ctx.session.step !== 'join_welcome_controls') {
    return ctx.reply('Avval salomlashuv matnini kiriting.');
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
  }
  const draft = ctx.session.joinWelcomeDraft;
  await JoinRequestChat.updateOne({ chatId: chat.chatId }, {
    $set: {
      welcomeMessage: draft.message,
      welcomeEntities: draft.entities,
      welcomeMediaType: draft.mediaType,
      welcomeMediaFileId: draft.mediaFileId,
      welcomeButtons: draft.buttons
    }
  });
  reset(ctx);
  return ctx.reply('✅ Salomlashuv saqlandi. Shu chatga ariza yuborganlarga bu xabar yuboriladi.');
});

bot.action('join_welcome:cancel', async (ctx) => {
  await ctx.answerCbQuery();
  reset(ctx);
  return ctx.reply('Salomlashuvni tahrirlash bekor qilindi.');
});

async function discardFailedJoinRequest(chatId, userId, source) {
  try {
    await PendingJoinRequest.deleteOne({ chatId, userId });
  } catch (error) {
    console.error(
      `Could not remove failed join request ${chatId}/${userId} (${source}):`,
      error.response?.description || error.message
    );
  }
}

bot.action(/^join_chat:approve_all:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = Number(ctx.match[1]);
  const chat = await isChatAdministrator(ctx, chatId);
  if (!chat) return ctx.reply(chat === null ? 'Ulangan chat topilmadi.' : 'Bu chatni boshqarish uchun uning administratori bo\'lishingiz kerak.');

  const requests = await PendingJoinRequest.find({ chatId }, { userId: 1 }).sort({ requestedAt: 1 }).lean();
  if (!requests.length) {
    return ctx.reply('Qabul qilinadigan kutilayotgan so\'rov yo\'q.', chatManagementKeyboard(chat, 0));
  }
  if (pendingBulkJoinApprovals.has(String(chatId))) {
    return ctx.reply('Bu chat uchun ommaviy qabul allaqachon bajarilmoqda.');
  }
  pendingBulkJoinApprovals.add(String(chatId));

  try {
    let nextIndex = 0;
    let approved = 0;
    let failed = 0;
    const workerCount = Math.min(5, requests.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < requests.length) {
        const request = requests[nextIndex];
        nextIndex += 1;
        try {
          await ctx.telegram.approveChatJoinRequest(chatId, request.userId);
          await PendingJoinRequest.deleteOne({ chatId, userId: request.userId });
          approved += 1;
        } catch (error) {
          failed += 1;
          console.error(`Bulk join request approval failed for ${chatId}/${request.userId}:`, error.response?.description || error.message);
          await discardFailedJoinRequest(chatId, request.userId, 'bulk approval');
        }
      }
    });
    await Promise.all(workers);

    const pendingCount = await PendingJoinRequest.countDocuments({ chatId });
    return ctx.reply(
      `Ommaviy qabul yakunlandi.\nQabul qilindi: ${approved}\nXatolik: ${failed}\nNavbatda qoldi: ${pendingCount}`,
      chatManagementKeyboard(chat, pendingCount)
    );
  } finally {
    pendingBulkJoinApprovals.delete(String(chatId));
  }
});

bot.action(/^join_chat:requests:(-?\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return showJoinRequestQueue(ctx, Number(ctx.match[1]), Number(ctx.match[2]));
});

bot.action(/^join_chat:unlink:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const chatId = Number(ctx.match[1]);
  const chat = await isChatAdministrator(ctx, chatId);
  if (!chat) return ctx.reply(chat === null ? 'Ulangan chat topilmadi.' : 'Bu chatni boshqarish uchun uning administratori bo\'lishingiz kerak.');
  await JoinRequestChat.deleteOne({ chatId });
  joinRequestChatIds.delete(String(chatId));
  return ctx.reply('Chat uzildi. Kutilayotgan so\'rovlar avtomatik qabul qilinmaydi.', {
    reply_markup: Markup.inlineKeyboard([[
      Markup.button.callback('⬅️ Chatlarim', 'join_chat:list')
    ]]).reply_markup
  });
});

bot.action(/^join_request:approve:(-?\d+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('So\'rovlar shaxsiy ma\'lumotlarsiz ko\'rsatiladi. Ularni ommaviy qabul qilish tugmasidan foydalaning.');
});

bot.action(/^join_chat:remove:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'join_requests')) return ctx.reply('Ruxsat yo\'q.');
  return ctx.reply('Boshqa foydalanuvchilar ulagan chatlarni admin paneldan boshqarib bo\'lmaydi. Jami sonini statistika bo\'limida ko\'ring.', adminKeyboard(ctx));
});

bot.on('chat_join_request', async (ctx) => {
  const request = ctx.chatJoinRequest;
  if (!request) return;
  const approvalKey = `${request.chat.id}:${request.from.id}`;
  if (pendingJoinApprovals.has(approvalKey)) return;
  pendingJoinApprovals.add(approvalKey);
  let approvalAttempted = false;

  try {
    const linkedChat = await JoinRequestChat.findOne(
      { chatId: request.chat.id },
      {
        paused: 1,
        title: 1,
        username: 1,
        welcomeMessage: 1,
        welcomeEntities: 1,
        welcomeMediaType: 1,
        welcomeMediaFileId: 1,
        welcomeButtons: 1
      }
    ).lean();
    if (!linkedChat) return;

    const requestFields = {
      username: request.from.username || '',
      firstName: request.from.first_name || '',
      lastName: request.from.last_name || '',
      requestedAt: request.date ? new Date(request.date * 1000) : new Date(),
      receivedAt: new Date()
    };
    try {
      await PendingJoinRequest.findOneAndUpdate(
        { chatId: request.chat.id, userId: request.from.id },
        { $set: requestFields },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      await PendingJoinRequest.updateOne(
        { chatId: request.chat.id, userId: request.from.id },
        { $set: requestFields }
      );
    }
    try {
      await sendJoinWelcomeMessage(
        ctx.telegram,
        request.user_chat_id || request.from.id,
        { ...linkedChat, title: linkedChat.title || request.chat.title },
        {
          message: linkedChat.welcomeMessage || 'Sizni tez orada qabul qilamiz!',
          entities: linkedChat.welcomeEntities || [],
          mediaType: linkedChat.welcomeMediaType || '',
          mediaFileId: linkedChat.welcomeMediaFileId || '',
          buttons: linkedChat.welcomeButtons || []
        }
      );
    } catch (error) {
      console.error(`Join-request welcome delivery failed for user ${request.from.id}:`, error.response?.description || error.message);
    }
    if (!joinRequestChatIds.has(String(request.chat.id)) || linkedChat.paused) return;

    approvalAttempted = true;
    await ctx.telegram.approveChatJoinRequest(request.chat.id, request.from.id);
    await PendingJoinRequest.deleteOne({ chatId: request.chat.id, userId: request.from.id });
  } catch (error) {
    const retryAfter = Number(error.parameters?.retry_after || error.response?.parameters?.retry_after);
    if (error.code === 429 && Number.isFinite(retryAfter) && retryAfter > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      try {
        const currentLink = await JoinRequestChat.findOne({ chatId: request.chat.id }, { paused: 1 }).lean();
        if (!currentLink || currentLink.paused) return;
        approvalAttempted = true;
        await ctx.telegram.approveChatJoinRequest(request.chat.id, request.from.id);
        await PendingJoinRequest.deleteOne({ chatId: request.chat.id, userId: request.from.id });
        return;
      } catch (retryError) {
        console.error(`Join request approval retry failed for chat ${request.chat.id}:`, retryError.response?.description || retryError.message);
        await discardFailedJoinRequest(request.chat.id, request.from.id, 'automatic approval retry');
        return;
      }
    }
    console.error(`Join request approval failed for chat ${request.chat.id}:`, error.response?.description || error.message);
    if (approvalAttempted) {
      await discardFailedJoinRequest(request.chat.id, request.from.id, 'automatic approval');
    }
  } finally {
    pendingJoinApprovals.delete(approvalKey);
  }
});

bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();
  if (await requiredSubscription(ctx)) return ctx.reply(welcomeMessage(ctx), replyOptions(welcomeMarkup(ctx) || userKeyboard(ctx).reply_markup));
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(configuredMessage('help', ctx), replyOptions());
});

function permissionForCallback(callbackData) {
  if (callbackData === 'admin:stats') return 'stats';
  if (callbackData === 'admin:admins' || callbackData === 'admin:add' || callbackData === 'admin:logs' || callbackData.startsWith('admin:manage:') || callbackData.startsWith('admin:perm:') || callbackData.startsWith('admin:remove:')) return 'admins';
  if (callbackData.startsWith('broadcast:')) return 'broadcast';
  if (callbackData === 'admin:join_chats' || callbackData.startsWith('join_chat:')) return 'join_requests';
  if (/^admin:(?:subscription|required_list|subscription_off|stream)/.test(callbackData)) return 'settings';
  return null;
}

function getChatCommand(ctx) {
  return ctx.message?.text || ctx.channelPost?.text || '';
}

function isChatLinkCommand(text) {
  return /^\/(?:connect|disconnect)(?:@\w+)?(?:\s|$)/i.test(text);
}

function chatManagementKeyboard(chat, pendingCount) {
  const paused = Boolean(chat.paused);
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      paused ? '▶️ So\'rovlarni davom ettirish' : '⏸ So\'rovlarni to\'xtatish',
      `join_chat:${paused ? 'resume' : 'pause'}:${chat.chatId}`
    )],
    [Markup.button.callback(
      `📨 Kutilayotgan so\'rovlar (${pendingCount})`,
      `join_chat:requests:${chat.chatId}:0`
    )],
    [Markup.button.callback('✅ Barchasini qabul qilish', `join_chat:approve_all:${chat.chatId}`)],
    [Markup.button.callback('✉️ Salomlashuvni tahrirlash', `join_chat:edit_welcome:${chat.chatId}`)],
    [Markup.button.callback('🔌 Chatni uzish', `join_chat:unlink:${chat.chatId}`)],
    [Markup.button.callback('⬅️ Chatlarim', 'join_chat:list')]
  ]);
}

function joinWelcomeMediaKeyboard(draft) {
  const rows = [];
  if (draft.mediaFileId) {
    rows.push([Markup.button.callback('✅ Mavjud mediani saqlash', 'join_welcome:keep_media')]);
  }
  rows.push([Markup.button.callback('📝 Mediasiz davom etish', 'join_welcome:no_media')]);
  rows.push([Markup.button.callback('❌ Bekor qilish', 'join_welcome:cancel')]);
  return Markup.inlineKeyboard(rows);
}

function joinWelcomeDraftKeyboard() {
  const rows = [
    [Markup.button.callback('➕ Havolali tugma qo\'shish', 'join_welcome:add_button')],
    [Markup.button.callback('🧹 Tugmalarni olib tashlash', 'join_welcome:clear_buttons')]
  ];
  rows.push(
    [Markup.button.callback('👁 Preview', 'join_welcome:preview'), Markup.button.callback('💾 Saqlash', 'join_welcome:save')],
    [Markup.button.callback('❌ Bekor qilish', 'join_welcome:cancel')]
  );
  return Markup.inlineKeyboard(rows);
}

function joinWelcomeColorKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔵 Ko\'k', 'join_welcome:color:blue'), Markup.button.callback('🟢 Yashil', 'join_welcome:color:green')],
    [Markup.button.callback('🔴 Qizil', 'join_welcome:color:red')]
  ]);
}

async function authorizeJoinWelcomeEdit(ctx) {
  const chatId = Number(ctx.session?.joinRequestChatId);
  if (!Number.isSafeInteger(chatId)) return null;
  return isChatAdministrator(ctx, chatId);
}

function prefixedWelcomeContent(chat, draft) {
  const prefix = `${chat.title || chat.username || 'Kanal'} ga xush kelibsiz. `;
  const message = String(draft.message || '');
  const entities = (draft.entities || []).map((entity) => ({
    ...entity,
    offset: entity.offset + prefix.length
  }));
  return { caption: `${prefix}${message}`, entities };
}

async function sendJoinWelcomeMessage(telegram, recipientId, chat, draft) {
  const { caption, entities } = prefixedWelcomeContent(chat, draft);
  const replyMarkup = draft.buttons?.length
    ? Markup.inlineKeyboard(draft.buttons).reply_markup
    : undefined;
  const common = replyMarkup ? { reply_markup: replyMarkup } : {};
  if (draft.mediaType === 'photo' && draft.mediaFileId) {
    return telegram.sendPhoto(recipientId, draft.mediaFileId, {
      ...common,
      caption,
      ...(entities.length ? { caption_entities: entities } : {})
    });
  }
  if (draft.mediaType === 'video' && draft.mediaFileId) {
    return telegram.sendVideo(recipientId, draft.mediaFileId, {
      ...common,
      caption,
      ...(entities.length ? { caption_entities: entities } : {})
    });
  }
  if (draft.mediaType === 'animation' && draft.mediaFileId) {
    return telegram.sendAnimation(recipientId, draft.mediaFileId, {
      ...common,
      caption,
      ...(entities.length ? { caption_entities: entities } : {})
    });
  }
  return telegram.sendMessage(recipientId, caption, {
    ...common,
    ...(entities.length ? { entities } : {})
  });
}

async function handleJoinWelcomeMedia(ctx, mediaType, fileId) {
  if (ctx.session?.step !== 'join_welcome_media') return false;
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('Salomlashuv mediasini botning shaxsiy chatida yuboring.');
    return true;
  }
  const chat = await authorizeJoinWelcomeEdit(ctx);
  if (!chat) {
    reset(ctx);
    await ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
    return true;
  }
  const caption = ctx.message.caption || '';
  const prefixLength = `${chat.title || chat.username || 'Kanal'} ga xush kelibsiz. `.length;
  if (caption.length > 1024 - prefixLength) {
    await ctx.reply(`Media izohi ${Math.max(0, 1024 - prefixLength)} belgidan oshmasligi kerak. Media va izohni qayta yuboring.`);
    return true;
  }
  ctx.session.joinWelcomeDraft.mediaType = mediaType;
  ctx.session.joinWelcomeDraft.mediaFileId = fileId;
  ctx.session.joinWelcomeDraft.message = caption;
  ctx.session.joinWelcomeDraft.entities = ctx.message.caption_entities || [];
  ctx.session.step = caption ? 'join_welcome_controls' : 'join_welcome_text';
  if (caption) {
    await ctx.reply('Media va izoh qabul qilindi. Preview qiling yoki havolali tugma qo\'shing.', joinWelcomeDraftKeyboard());
  } else {
    await ctx.reply('Media qabul qilindi. Endi salomlashuv matnini yuboring (media izohi sifatida qo\'shiladi):');
  }
  return true;
}

async function isChatAdministrator(ctx, chatId) {
  const chat = await JoinRequestChat.findOne({ chatId }).lean();
  if (!chat) return null;
  try {
    const member = await ctx.telegram.getChatMember(chatId, ctx.from.id);
    if (['creator', 'administrator'].includes(member.status)) return chat;
  } catch (error) {
    console.error(`Chat admin verification failed for ${chatId}:`, error.response?.description || error.message);
  }
  return false;
}

async function showJoinRequestChats(ctx) {
  const ownerChats = await JoinRequestChat.find({ linkedBy: ctx.from.id }).sort({ createdAt: -1 }).limit(50).lean();
  if (!ownerChats.length) {
    return ctx.reply('Hali sizga ulangan chat yo\'q. Botni kanalga qo\'shib, so\'rovlarni boshqarish uchun administrator qiling.');
  }
  const pendingCounts = await PendingJoinRequest.aggregate([
    { $match: { chatId: { $in: ownerChats.map((chat) => chat.chatId) } } },
    { $group: { _id: '$chatId', count: { $sum: 1 } } }
  ]);
  const countsByChat = new Map(pendingCounts.map((item) => [item._id, item.count]));
  const buttons = ownerChats.map((chat) => {
    const pendingCount = countsByChat.get(chat.chatId) || 0;
    const suffix = pendingCount ? ` · 📨 ${pendingCount}` : '';
    const title = (chat.title || chat.username || String(chat.chatId)).slice(0, Math.max(1, 48 - suffix.length));
    return [Markup.button.callback(
      `${chat.paused ? '⏸' : '▶️'} ${title}${suffix}`,
      `join_chat:open:${chat.chatId}`
    )];
  });
  return ctx.reply('Boshqarish uchun kanal yoki guruhni tanlang:', Markup.inlineKeyboard(buttons));
}

async function showJoinRequestQueue(ctx, chatId, page = 0) {
  const chat = await isChatAdministrator(ctx, chatId);
  if (!chat) return ctx.reply(chat === null ? 'Ulangan chat topilmadi.' : 'Bu chatni boshqarish uchun uning administratori bo\'lishingiz kerak.');
  const total = await PendingJoinRequest.countDocuments({ chatId });
  if (!total) return ctx.reply('Kutilayotgan qo\'shilish so\'rovlari yo\'q.', chatManagementKeyboard(chat, 0));

  const rows = [
    [Markup.button.callback('✅ Barchasini qabul qilish', `join_chat:approve_all:${chatId}`)],
    [Markup.button.callback('⬅️ Chat boshqaruvi', `join_chat:open:${chatId}`)]
  ];
  return ctx.reply(
    `Kutilayotgan so\'rovlar jami: ${total}`,
    Markup.inlineKeyboard(rows)
  );
}

async function verifyJoinRequestChat(ctx, chat, actorId) {
  if (!['channel', 'group', 'supergroup'].includes(chat.type)) {
    throw new Error('Faqat kanal yoki guruhni ulash mumkin.');
  }

  if (actorId) {
    const actor = await ctx.telegram.getChatMember(chat.id, actorId);
    if (!['creator', 'administrator'].includes(actor.status)) {
      throw new Error('Ulash uchun ushbu chatda administrator bo\'lishingiz kerak.');
    }
  }

  const botMember = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id);
  if (botMember.status === 'creator') return;
  if (botMember.status !== 'administrator') {
    throw new Error('Avval botni ushbu chatga administrator qilib qo\'shing.');
  }
  if (botMember.can_invite_users !== true) {
    throw new Error('Bot administratoriga foydalanuvchilarni taklif qilish huquqini bering.');
  }
  if (botMember.can_delete_messages !== true) {
    throw new Error('Kanal/guruhdagi /connect va /disconnect xabarlarini o\'chirish uchun botga xabarlarni o\'chirish huquqini bering.');
  }
}

async function replyPrivatelyAndDelete(ctx, chat, messageId, userId, message) {
  try {
    await ctx.telegram.deleteMessage(chat.id, messageId);
  } catch (error) {
    console.error(`Could not delete command message in chat ${chat.id}:`, error.response?.description || error.message);
  }
  if (!userId) return;
  try {
    await ctx.telegram.sendMessage(userId, message, { protect_content: true });
  } catch (error) {
    console.error(`Private command response failed for user ${userId}:`, error.response?.description || error.message);
  }
}

async function handleJoinChatCommand(ctx, command, chat, actorId, channelPost = false) {
  let notifyUserId = actorId;
  if (channelPost) {
    const linkedChat = await JoinRequestChat.findOne({ chatId: chat.id }, { linkedBy: 1 }).lean();
    notifyUserId = linkedChat?.linkedBy || null;
  }

  const respond = async (message) => {
    if (!channelPost && ctx.chat?.type === 'private') return ctx.reply(message);
    const messageId = channelPost ? ctx.channelPost.message_id : ctx.message?.message_id;
    if (messageId) {
      try {
        await ctx.telegram.deleteMessage(chat.id, messageId);
      } catch (error) {
        console.error(`Could not delete ${command} message in chat ${chat.id}:`, error.response?.description || error.message);
      }
    }
    if (!notifyUserId) {
      console.warn(`Cannot privately notify the author of ${command} in channel ${chat.id}; link the channel from a private chat first.`);
      return;
    }
    try {
      await ctx.telegram.sendMessage(notifyUserId, message, { protect_content: true });
    } catch (error) {
      console.error(`Private notification for ${command} in channel ${chat.id} failed:`, error.response?.description || error.message);
    }
  };

  try {
    if (command.toLowerCase().startsWith('/connect')) {
      if (channelPost && !notifyUserId) {
        return respond('Kanalni ulash uchun botning shaxsiy chatida /connect yuborib, olgan 6 xonali kodingizni kanalda /connect 123456 shaklida yuboring.');
      }
      await verifyJoinRequestChat(ctx, chat, actorId);
      const fields = {
        title: chat.title || chat.username || String(chat.id),
        type: chat.type,
        username: chat.username ? `@${chat.username}` : ''
      };
      if (actorId) fields.linkedBy = actorId;
      await JoinRequestChat.findOneAndUpdate(
        { chatId: chat.id },
        { $set: fields, $setOnInsert: { paused: false } },
        { upsert: true, setDefaultsOnInsert: true, returnDocument: 'after' }
      );
      joinRequestChatIds.add(String(chat.id));
      if (actorId && ctx.chat.type === 'private') {
        return respond('✅ Chat ulandi. So\'rovlarni boshqarish uchun /mychats buyrug\'idan foydalaning.');
      }
      if (!actorId) {
        return respond('✅ Kanal yangilandi. So\'rovlarni boshqarish uchun botning shaxsiy chatida /mychats buyrug\'ini yuboring.');
      }
      return respond('✅ Chat ulandi. So\'rovlarni botning shaxsiy chatida /mychats buyrug\'i orqali boshqaring.');
    }

    if (actorId) {
      const actor = await ctx.telegram.getChatMember(chat.id, actorId);
      if (!['creator', 'administrator'].includes(actor.status)) {
        return respond('Ulashni bekor qilish uchun ushbu chatda administrator bo\'lishingiz kerak.');
      }
    }
    const result = await JoinRequestChat.deleteOne({ chatId: chat.id });
    joinRequestChatIds.delete(String(chat.id));
    return respond(result.deletedCount
      ? 'Chat uzildi. Yangi qo\'shilish so\'rovlari avtomatik qabul qilinmaydi.'
      : 'Bu chat botga ulanmagan edi.');
  } catch (error) {
    console.error(`Join-request chat ${command} failed for ${chat.id}:`, error.response?.description || error.message);
    return respond(error.message || 'Chatni ulashda xatolik yuz berdi.');
  }
}

async function handleChannelLinkCommand(ctx) {
  const text = getChatCommand(ctx);
  if (!isChatLinkCommand(text)) return;
  if (/^\/connect(?:@\w+)?(?:\s|$)/i.test(text)) {
    return handleJoinRequestConnectCode(ctx, text);
  }
  return handleJoinChatCommand(ctx, text, ctx.channelPost.chat, null, true);
}

function hashJoinRequestLinkCode(code) {
  return crypto.createHmac('sha256', config.botToken).update(code).digest('hex');
}

async function issueJoinRequestLinkCode(ctx) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = hashJoinRequestLinkCode(code);
    try {
      await JoinRequestLinkCode.findOneAndUpdate(
        { telegramId: ctx.from.id },
        { $set: { codeHash, expiresAt, claimedAt: null, claimedChatId: null } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      return ctx.reply(
        `Bir martalik kanal ulash kodi: <code>${code}</code>\n\n` +
        `10 daqiqa ichida bot administrator bo\'lgan kanal yoki guruhga /connect ${code} yuboring. ` +
        `Kodni boshqalarga bermang. Chat ulanganidan keyin natijani shu shaxsiy chatga yuboraman.`,
        { parse_mode: 'HTML', protect_content: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }

  throw new Error('Bir martalik kod yaratib bo\'lmadi. Birozdan keyin qayta urinib ko\'ring.');
}

async function handleJoinRequestConnectCode(ctx, command) {
  const chat = ctx.chat;
  const message = ctx.channelPost || ctx.message;
  const actorId = ctx.from?.id;
  const code = command.replace(/^\/connect(?:@\w+)?\s*/i, '').trim();
  let challenge;
  let linkSaved = false;

  try {
    if (!/^\d{6}$/.test(code)) {
      return replyPrivatelyAndDelete(ctx, chat, message.message_id, actorId,
        'Kanal/guruh ulash kodi 6 ta raqamdan iborat bo\'lishi kerak. Botning shaxsiy chatida /connect yuborib yangi kod oling.');
    }

    try {
      await ctx.telegram.deleteMessage(chat.id, message.message_id);
    } catch (error) {
      console.error(`Could not delete /connect code in chat ${chat.id}:`, error.response?.description || error.message);
    }

    challenge = await JoinRequestLinkCode.findOneAndUpdate(
      {
        codeHash: hashJoinRequestLinkCode(code),
        expiresAt: { $gt: new Date() },
        claimedAt: null
      },
      { $set: { claimedAt: new Date(), claimedChatId: chat.id } },
      { returnDocument: 'after' }
    ).lean();

    if (!challenge) {
      console.warn(`Invalid or expired chat connection code submitted in chat ${chat.id}.`);
      if (actorId) {
        try {
          await ctx.telegram.sendMessage(actorId, 'Kod yaroqsiz yoki muddati tugagan. Botning shaxsiy chatida /connect yuborib yangi kod oling.');
        } catch (error) {
          console.error(`Invalid-code notification failed for user ${actorId}:`, error.response?.description || error.message);
        }
      }
      return;
    }

    await verifyJoinRequestChat(ctx, chat, challenge.telegramId);
    const consumedCode = await JoinRequestLinkCode.deleteOne({
      _id: challenge._id,
      claimedChatId: chat.id
    });
    if (consumedCode.deletedCount !== 1) {
      throw new Error('Kod muddati tugagan yoki allaqachon ishlatilgan. Yangi /connect kodi oling.');
    }
    await JoinRequestChat.findOneAndUpdate(
      { chatId: chat.id },
      {
        $set: {
          title: chat.title || chat.username || String(chat.id),
          type: chat.type,
          username: chat.username ? `@${chat.username}` : '',
          linkedBy: challenge.telegramId
        },
        $setOnInsert: { paused: false }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    linkSaved = true;
    joinRequestChatIds.add(String(chat.id));
    await ctx.telegram.sendMessage(
      challenge.telegramId,
      `✅ “${chat.title || chat.username || chat.id}” chat ulandi. Ulanish tasdiqlandi: siz chat egasi yoki administratorisiz. Boshqarish uchun /mychats yuboring.`,
      { protect_content: true }
    );
  } catch (error) {
    if (challenge) {
      if (!linkSaved) {
        await JoinRequestLinkCode.updateOne(
          { _id: challenge._id, claimedChatId: chat.id },
          { $set: { claimedAt: null, claimedChatId: null } }
        );
      }
      try {
        await ctx.telegram.sendMessage(
          challenge.telegramId,
          linkSaved
            ? '✅ Kanal ulandi, lekin tasdiq xabarini yuborib bo\'lmadi. /mychats orqali tekshiring.'
            : `❌ Kanalni ulab bo\'lmadi: ${error.message || 'xatolik yuz berdi'}. Bot adminligi va kerakli huquqlarni tekshirib, yangi kod oling.`,
          { protect_content: true }
        );
      } catch (notifyError) {
        console.error(`Private channel-link failure notification failed for ${challenge.telegramId}:`, notifyError.response?.description || notifyError.message);
      }
    }
    console.error(`Channel connect code failed for ${chat.id}:`, error.response?.description || error.message);
  }
}

bot.hears(/^(?:Admin panel|🛠 Admin panel)$/, (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  activateAdminPanel(ctx);
  return ctx.reply('Admin panel', adminKeyboard(ctx));
});

bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  activateAdminPanel(ctx);
  return ctx.reply('Admin panel', adminKeyboard(ctx));
});

bot.action('admin:stats', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  return adminStats(ctx);
});

bot.action('admin:live_test', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Jonli xabar sinovini faqat asosiy admin ishlata oladi.');

  try {
    const today = getTashkentScoreboardDate();
    const tomorrow = getTashkentScoreboardDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const results = await Promise.allSettled([
      fetchSoccerScoreboard(today),
      fetchSoccerScoreboard(tomorrow)
    ]);
    const events = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value.events);
    const event = findNextScheduledSoccerMatch(events);
    if (!event) {
      const failed = results.some((result) => result.status === 'rejected');
      return ctx.reply(failed
        ? 'Yaqin o‘yinlarni yuklab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring.'
        : 'Keyingi 24 soat ichida boshlanadigan o‘yin topilmadi.');
    }

    const text = [
      `🧪 <b>TEST — jonli o‘yin xabari</b>`,
      ``,
      `<b>${escapeHtml(event.home.name)} — ${escapeHtml(event.away.name)}</b>`,
      `${escapeHtml(event.leagueName)} · ${formattedMatchTime(event.startTime)}`,
      `Bu sinov xabari faqat sizga yuborildi.`
    ].join('\n');
    await ctx.telegram.sendMessage(ctx.from.id, text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([[
        Markup.button.webApp('⚽ O‘yin ma’lumotlari', getMatchMiniAppUrl(event))
      ]]).reply_markup
    });
    return ctx.reply('Sinov xabari yuborildi. Undagi tugma orqali Mini App’da o‘yin kartasini tekshiring.');
  } catch (error) {
    console.error('Live match notification test failed:', error.response?.description || error.message);
    return ctx.reply('Sinov xabarini yuborib bo‘lmadi. Xatolik qayd etildi, keyinroq qayta urinib ko‘ring.');
  }
});

bot.action('admin:panel', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  activateAdminPanel(ctx);
  return ctx.reply('Admin panel', adminKeyboard(ctx));
});

bot.action('admin:stream', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  const current = soccerLiveStreams.length
    ? `Faol efirlar (${soccerLiveStreams.length}):\n${soccerLiveStreams.map((stream, index) =>
      `${index + 1}. ${stream.title || 'Nomsiz efir'} (${stream.type === 'youtube' ? 'YouTube' : 'HLS'})`
    ).join('\n')}`
    : 'Hozircha efir manzili sozlanmagan.';
  const streamButtons = soccerLiveStreams.map((stream) => [
    Markup.button.callback(
      `⏹ ${stream.title || 'Nomsiz efir'}`.slice(0, 64),
      `admin:stream_off:${stream.id}`
    )
  ]);
  return ctx.reply(
    `${current}\n\nYouTube efir havolasi yoki HTTPS HLS (.m3u8) havolasini kiriting.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔗 Efir havolasini kiritish', 'admin:stream_set')],
      ...streamButtons,
      ...(soccerLiveStreams.length
        ? [[Markup.button.callback('⏹ Barcha efirlarni o‘chirish', 'admin:stream_off')]]
        : []),
      [Markup.button.callback('⬅️ Admin panel', 'admin:panel')]
    ])
  );
});

bot.action('admin:stream_set', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  if (ctx.chat?.type !== 'private') {
    return ctx.reply('Efir havolasini botning shaxsiy chatida kiriting.');
  }
  ctx.session = { step: 'live_stream_url', adminPanelActive: true };
  return ctx.reply(
    'YouTube efir havolasini (masalan, https://www.youtube.com/live/...) yoki HTTPS HLS (.m3u8) havolasini yuboring. HLS manbasi CORS orqali Mini App domeniga ruxsat berishi kerak. Bekor qilish uchun /cancel bosing.'
  );
});

bot.action('admin:stream_auto_match', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  if (ctx.chat?.type !== 'private' || ctx.session?.step !== 'live_stream_match_choice' ||
      !ctx.session.liveStreamDraft) {
    return ctx.reply('Efir sozlash jarayoni topilmadi. Admin paneldan qaytadan boshlang.');
  }
  try {
    const events = await findUpcomingStreamMatches();
    if (!events.length) {
      return ctx.reply(
        'Oxirgi 30 daqiqada boshlangan yoki keyingi 30 daqiqada boshlanadigan o‘yin topilmadi. Efirga o‘zingiz nom berishingiz mumkin:',
        Markup.inlineKeyboard([
          [Markup.button.callback('✍️ Efirga nom berish', 'admin:stream_custom_title')],
          [Markup.button.callback('❌ Bekor qilish', 'admin:stream_cancel')]
        ])
      );
    }
    ctx.session.step = 'live_stream_match_selection';
    const rows = events.map((event) => {
      const timing = event.state === 'in'
        ? `🔴 ${event.clock || event.status || 'Jonli'}`
        : `🕒 ${formattedMatchTime(event.startTime)}`;
      const label = `${timing} · ${event.home.name} — ${event.away.name}`;
      return [Markup.button.callback(
        label.length > 64 ? `${label.slice(0, 61)}…` : label,
        `admin:stream_match:${event.leagueId}:${event.id}`
      )];
    });
    rows.push([Markup.button.callback('✍️ O‘zim nom beraman', 'admin:stream_custom_title')]);
    rows.push([Markup.button.callback('❌ Bekor qilish', 'admin:stream_cancel')]);
    return ctx.reply('Oxirgi 30 daqiqada boshlangan yoki keyingi 30 daqiqada boshlanadigan o‘yinni tanlang:', Markup.inlineKeyboard(rows));
  } catch (error) {
    console.error('Upcoming live stream matches could not be loaded:', error.message);
    return ctx.reply('Yaqin o‘yinlarni yuklab bo‘lmadi. Birozdan keyin qayta urinib ko‘ring yoki efirga o‘zingiz nom bering.', Markup.inlineKeyboard([
      [Markup.button.callback('✍️ Efirga nom berish', 'admin:stream_custom_title')],
      [Markup.button.callback('❌ Bekor qilish', 'admin:stream_cancel')]
    ]));
  }
});

bot.action(/^admin:stream_match:([a-z0-9.]+):([A-Za-z0-9_-]{1,30})$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  const draft = ctx.session?.liveStreamDraft;
  if (ctx.chat?.type !== 'private' || ctx.session?.step !== 'live_stream_match_selection' || !draft) {
    return ctx.reply('Efir sozlash jarayoni topilmadi. Admin paneldan qaytadan boshlang.');
  }
  try {
    const events = await findUpcomingStreamMatches();
    const event = events.find((item) => item.leagueId === ctx.match[1] && item.id === ctx.match[2]);
    if (!event) {
      ctx.session.step = 'live_stream_match_choice';
      return ctx.reply('Bu o‘yin so‘nggi yoki keyingi 30 daqiqa ro‘yxatidan chiqdi. Efirga o‘zingiz nom bering yoki boshqa o‘yin tanlang.', Markup.inlineKeyboard([
        [Markup.button.callback('🔄 O‘yinlarni qayta yuklash', 'admin:stream_auto_match')],
        [Markup.button.callback('✍️ Efirga nom berish', 'admin:stream_custom_title')],
        [Markup.button.callback('❌ Bekor qilish', 'admin:stream_cancel')]
      ]));
    }
    const stream = {
      ...draft,
      title: `${event.home.name} — ${event.away.name}`,
      match: {
        id: String(event.id),
        leagueId: event.leagueId,
        leagueName: event.leagueName,
        startTime: event.startTime,
        homeName: event.home.name,
        awayName: event.away.name,
        homeLogo: event.home.logo,
        awayLogo: event.away.logo
      }
    };
    await saveSoccerLiveStream(ctx, stream);
    reset(ctx);
    const streamUrl = getMiniAppLiveStreamUrl(stream.id);
    return ctx.reply(
      `✅ “${stream.title}” o‘yini uchun jonli efir yoqildi.\nMini App havolasi: ${streamUrl}`,
      Markup.inlineKeyboard([[
        Markup.button.webApp('▶️ Jonli efirni ochish', streamUrl)
      ]])
    );
  } catch (error) {
    console.error('Live stream match selection failed:', error.response?.description || error.message);
    return ctx.reply('O‘yin tanlovini saqlab bo‘lmadi. Qayta urinib ko‘ring.');
  }
});

bot.action('admin:stream_custom_title', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  if (ctx.chat?.type !== 'private' ||
      !['live_stream_match_choice', 'live_stream_match_selection'].includes(ctx.session?.step) ||
      !ctx.session.liveStreamDraft) {
    return ctx.reply('Efir sozlash jarayoni topilmadi. Admin paneldan qaytadan boshlang.');
  }
  ctx.session.step = 'live_stream_title';
  return ctx.reply('Efir uchun nom yuboring (masalan, “Paxtakor — Bunyodkor”). 100 belgigacha.');
});

bot.action('admin:stream_cancel', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  reset(ctx);
  return ctx.reply('Jonli efir sozlash bekor qilindi.', adminKeyboard(ctx));
});

bot.action('admin:stream_off', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  await BotConfig.findOneAndUpdate(
    { configKey: 'main_config' },
    { $set: { 'settings.liveStreams': [], 'settings.liveStream': null } },
    { upsert: true }
  );
  soccerLiveStreams = [];
  activeSoccerStreamViewers.clear();
  await logAdminAction(ctx, 'mini_app_live_stream_disabled');
  return ctx.reply('Barcha jonli efirlar Mini App’dan o‘chirildi.', adminKeyboard(ctx));
});

bot.action(/^admin:stream_off:([A-Za-z0-9_-]{16,80})$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  const stream = soccerLiveStreams.find((item) => item.id === ctx.match[1]);
  if (!stream) return ctx.reply('Bu efir allaqachon o‘chirilgan.');
  const updatedStreams = soccerLiveStreams.filter((item) => item.id !== stream.id);
  await BotConfig.findOneAndUpdate(
    { configKey: 'main_config' },
    { $set: { 'settings.liveStreams': updatedStreams, 'settings.liveStream': null } },
    { upsert: true }
  );
  soccerLiveStreams = updatedStreams;
  for (const [viewerId, viewer] of activeSoccerStreamViewers) {
    if (viewer.streamId === stream.id) activeSoccerStreamViewers.delete(viewerId);
  }
  await logAdminAction(ctx, 'mini_app_live_stream_disabled', stream.id);
  return ctx.reply(`“${stream.title || 'Nomsiz efir'}” efiri o‘chirildi.`, adminKeyboard(ctx));
});

bot.action('admin:exit', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  reset(ctx, true);
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (error) {
    console.warn('Admin panel close failed:', error.response?.description || error.message);
  }
  return ctx.reply(welcomeMessage(ctx), replyOptions(welcomeMarkup(ctx)));
});

bot.action('admin:admins', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu bo\'limni boshqaradi.');
  const admins = await Admin.find({ active: true }).sort({ createdAt: 1 }).lean();
  const text = admins.length
    ? admins.map((admin, index) => `${index + 1}. ${admin.nickname || admin.username || admin.telegramId} - ${permissionsLabel(admin.permissions)}`).join('\n')
    : 'Hali qo\'shimcha adminlar yo\'q.';
  const rows = admins.map((admin) => [{
    ...Markup.button.callback(
      `⚙️ ${admin.nickname || admin.username || admin.telegramId}`, `admin:manage:${admin.telegramId}`
    ),
    style: 'primary'
  }]);
  rows.push([{ ...Markup.button.callback('➕ Admin qo\'shish', 'admin:add'), style: 'success' }]);
  rows.push([{ ...Markup.button.callback('⬅️ Admin panel', 'admin:panel'), style: 'primary' }]);
  return ctx.reply(`👥 Adminlar\n\n${text}`, Markup.inlineKeyboard(rows));
});

bot.action('admin:logs', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu bo\'limni boshqaradi.');
  const logs = await AdminLog.find({}).sort({ createdAt: -1 }).limit(20).lean();
  if (!logs.length) return ctx.reply('Hali admin amallari qayd etilmagan.', adminKeyboard(ctx));
  const text = logs.map((log, index) => {
    const date = new Date(log.createdAt).toLocaleString('uz-UZ', { timeZone: config.timezone });
    return `${index + 1}. ${log.adminName || log.adminTelegramId}\n${log.action}${log.details ? ` - ${log.details}` : ''}\n${date}`;
  }).join('\n\n');
  return ctx.reply(`🧾 Oxirgi admin amallari\n\n${text}`, adminKeyboard(ctx));
});

bot.action('admin:add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu bo\'limni boshqaradi.');
  ctx.session = { step: 'admin_add', adminPanelActive: true };
  return ctx.reply('Qo\'shiladigan adminning Telegram ID raqamini yuboring:');
});

bot.action(/^admin:manage:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu bo\'limni boshqaradi.');
  const admin = await Admin.findOne({ telegramId: Number(ctx.match[1]), active: true }).lean();
  if (!admin) return ctx.reply('Admin topilmadi.', adminKeyboard(ctx));
  return ctx.reply(
    `Admin: ${admin.nickname || admin.username || admin.telegramId}\nID: ${admin.telegramId}\nHuquqlar: ${permissionsLabel(admin.permissions)}`,
    adminManagementKeyboard(admin)
  );
});

bot.action(/^admin:perm:(\d+):(broadcast|stats|settings|join_requests|admins)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu bo\'limni boshqaradi.');
  const telegramId = Number(ctx.match[1]);
  const permission = ctx.match[2];
  const admin = await Admin.findOne({ telegramId, active: true });
  if (!admin) return ctx.reply('Admin topilmadi.', adminKeyboard(ctx));
  admin.permissions = admin.permissions.includes(permission)
    ? admin.permissions.filter((item) => item !== permission)
    : [...admin.permissions, permission];
  await admin.save();
  adminRegistry.set(telegramId, admin.toObject());
  await logAdminAction(ctx, 'admin_permission_changed', `${telegramId}: ${permission}`);
  return ctx.reply(`Huquq yangilandi.\n\nHuquqlar: ${permissionsLabel(admin.permissions)}`, adminManagementKeyboard(admin));
});

bot.action(/^admin:remove:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu bo\'limni boshqaradi.');
  const telegramId = Number(ctx.match[1]);
  await Admin.updateOne({ telegramId }, { $set: { active: false } });
  adminRegistry.delete(telegramId);
  await logAdminAction(ctx, 'admin_removed', String(telegramId));
  return ctx.reply('Admin o\'chirildi.', adminKeyboard(ctx));
});

bot.action('admin:broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'broadcast_media', broadcast: { buttons: [] }, adminPanelActive: true };
  return ctx.reply('<tg-emoji emoji-id="5350693961281314631">🖼</tg-emoji> Xabar uchun rasm, video yoki GIF yuboring. Media shart emas:', replyOptions(broadcastKeyboard().reply_markup));
});

bot.action('broadcast:no_media', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') return ctx.reply('Broadcast jarayoni topilmadi.');
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('<tg-emoji emoji-id="5393314064220843793">💬</tg-emoji> Xabar matnini yuboring. Premium emoji uchun HTML teglaridan foydalanishingiz mumkin:', replyOptions());
});

bot.action('broadcast:add_button', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_buttons') return ctx.reply('Avval xabar matnini kiriting.');
  ctx.session.step = 'broadcast_button_text';
  return ctx.reply('Inline tugma nomini yuboring (1–64 belgi). Premium emoji yuborsangiz, u tugma ikonkasiga aylanadi:');
});

bot.action(/^broadcast:type:(url|web_app|command)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_button_type') return ctx.reply('Tugma turi tanlash bosqichi topilmadi.');
  ctx.session.pendingButtonType = ctx.match[1];
  if (ctx.match[1] === 'command') {
    ctx.session.step = 'broadcast_button_command';
    return ctx.reply('Tugma bosilganda bajariladigan buyruqni tanlang:', broadcastCommandKeyboard());
  }
  if (ctx.match[1] === 'web_app') {
    ctx.session.pendingButtonUrl = getWebAppUrl();
    ctx.session.step = 'broadcast_button_color';
    return ctx.reply('Tugma rangini tanlang:', broadcastColorKeyboard());
  }
  ctx.session.step = 'broadcast_button_url';
  return ctx.reply('Tugma havolasini yuboring (https://...):');
});

bot.action(/^broadcast:command:(start|app|live|connect|mychats|help)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_button_command') {
    return ctx.reply('Avval inline tugma uchun bot buyrug‘ini tanlang.');
  }
  ctx.session.pendingButtonCommand = ctx.match[1];
  ctx.session.step = 'broadcast_button_color';
  return ctx.reply('Tugma rangini tanlang:', broadcastColorKeyboard());
});

bot.action('broadcast:preview', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_buttons') return ctx.reply('Avval xabarni tayyorlang.');
  return previewBroadcast(ctx);
});

bot.action(/^broadcast:color:(blue|green|red)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_button_color') return ctx.reply('Tugma rangi tanlash bosqichi topilmadi.');
  const style = { blue: 'primary', green: 'success', red: 'danger' }[ctx.match[1]];
  const kind = ctx.session.pendingButtonType || 'url';
  const button = buildBroadcastInlineButton(
    ctx.session.pendingButtonText,
    kind === 'command' ? ctx.session.pendingButtonCommand : ctx.session.pendingButtonUrl,
    kind,
    style,
    ctx.session.pendingButtonEmojiId
  );
  ctx.session.broadcast.buttons.push([button]);
  ctx.session.pendingButtonText = undefined;
  ctx.session.pendingButtonUrl = undefined;
  ctx.session.pendingButtonCommand = undefined;
  ctx.session.pendingButtonType = undefined;
  ctx.session.pendingButtonEmojiId = undefined;
  ctx.session.step = 'broadcast_buttons';
  return ctx.reply('Tugma qo\'shildi. Yana tugma qo\'shasizmi?', broadcastButtonKeyboard());
});

bot.action('broadcast:send', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !ctx.session?.broadcast?.previewed) return ctx.reply('Avval Preview tugmasini bosing.');
  const result = await sendBroadcast(ctx);
  await logAdminAction(ctx, 'broadcast_sent', `total=${result.total}, sent=${result.sent}, failed=${result.failed}`);
  reset(ctx);
  return ctx.telegram.sendMessage(
    ctx.from.id,
    `Xabar yuborish yakunlandi.\nJami: ${result.total}\nYetib bordi: ${result.sent}\nBloklagan: ${result.blocked}\nBazadan o'chirildi: ${result.removed}\nXatolik: ${result.failed}\nTezlik: ${result.messagesPerSecond.toFixed(1)} xabar/soniya`,
    { reply_markup: adminKeyboard(ctx).reply_markup }
  );
});

bot.action('broadcast:cancel', async (ctx) => {
  await ctx.answerCbQuery();
  reset(ctx);
  return ctx.reply('Xabar yuborish bekor qilindi.', adminKeyboard(ctx));
});

bot.action('admin:subscription', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  ctx.session = { step: 'required_subscription_channel', adminPanelActive: true };
  return ctx.reply(
    'Ochiq kanal uchun username yuboring (masalan, @my_channel). Kanal yoki guruhni ro\'yxatdan tanlab, botni avtomatik admin qilish uchun quyidagi tugmani bosing:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Kanal yoki guruh tanlash', 'admin:subscription_private')],
      [Markup.button.callback('❌ Bekor qilish', 'admin:subscription_private_cancel')]
    ])
  );
});

bot.action('welcome:required_add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin bu amalni bajarishi mumkin.');
  ctx.session = { step: 'required_subscription_channel', adminPanelActive: true };
  return ctx.reply(
    'Ochiq kanal uchun username yuboring (masalan, @my_channel). Kanal yoki guruhni ro\'yxatdan tanlab, botni avtomatik admin qilish uchun quyidagi tugmani bosing:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📢 Kanal yoki guruh tanlash', 'admin:subscription_private')],
      [Markup.button.callback('❌ Bekor qilish', 'admin:subscription_private_cancel')]
    ])
  );
});

bot.action('admin:subscription_private', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) return ctx.reply('Ruxsat yo\'q.');
  if (ctx.chat?.type !== 'private') {
    return ctx.reply('Kanal yoki guruh tanlashni botning shaxsiy chatida boshlang.');
  }
  ctx.session = { adminPanelActive: true };
  try {
    return await startChatPicker(ctx, 'required_subscription');
  } catch (error) {
    console.error('Required channel picker could not be sent:', error.response?.description || error.message);
    return ctx.reply(`Kanal yoki guruh tanlash oynasini ochib bo'lmadi: ${error.response?.description || error.message}`);
  }
});

bot.action('admin:subscription_private_cancel', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  clearChatSelections(Number(ctx.from.id));
  ctx.session = { adminPanelActive: true };
  return ctx.reply('Kanal/guruh tanlash bekor qilindi.', adminKeyboard(ctx));
});

bot.action('welcome:join_chat_connect', async (ctx) => {
  await ctx.answerCbQuery();
  if (ctx.chat?.type !== 'private') {
    return ctx.reply('Kanal yoki guruh ulash uchun botning shaxsiy chatida Start xabaridagi tugmani bosing.');
  }
  return openJoinRequestChatPicker(ctx);
});

bot.action('welcome:applications', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.editMessageText(
    `<b>📝 Zayafka</b>\n\n${welcomeApplicationsMessage()}`,
    replyOptions(welcomeApplicationsMarkup())
  );
});

bot.action('welcome:back', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.editMessageText(welcomeMessage(ctx), replyOptions(welcomeMarkup(ctx)));
});

bot.action('welcome:live_streams', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.editMessageText(
    liveStreamsMessage(),
    replyOptions(liveStreamsKeyboard())
  );
});

bot.action('welcome:required_list', async (ctx) => {
  await ctx.answerCbQuery();
  return showJoinRequestChats(ctx);
});

bot.action('admin:required_list', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  const channels = await getRequiredChannels();
  if (!channels.length) return ctx.reply('Majburiy obuna kanallari yo\'q.', adminKeyboard(ctx));
  return ctx.reply(channels.map((channel, index) => `${index + 1} - kanal: ${channel.title || channel.username || channel.id}`).join('\n'), adminKeyboard(ctx));
});

bot.action('admin:subscription_off', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
  data.settings.requiredChannels = [];
  await saveSettings();
  return ctx.reply('Majburiy obuna o\'chirildi.', adminKeyboard(ctx));
});

bot.on('video', async (ctx) => {
  if (await handleJoinWelcomeMedia(ctx, 'video', ctx.message.video.file_id)) return;
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') {
    return ctx.reply('Bu turdagi media xabar qabul qilinmaydi.');
  }
  ctx.session.broadcast.mediaType = 'video';
  ctx.session.broadcast.media = ctx.message.video.file_id;
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('Media uchun izoh yuboring:');
});

bot.on('photo', async (ctx) => {
  if (await handleJoinWelcomeMedia(ctx, 'photo', ctx.message.photo.at(-1).file_id)) return;
  if (isAdmin(ctx) && ctx.session?.step === 'broadcast_media') {
    ctx.session.broadcast.mediaType = 'photo';
    ctx.session.broadcast.media = ctx.message.photo.at(-1).file_id;
    ctx.session.step = 'broadcast_caption';
    return ctx.reply('Media uchun izoh yuboring:');
  }
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') {
    return ctx.reply('Bu turdagi media xabar qabul qilinmaydi.');
  }
  ctx.session.broadcast.mediaType = 'photo';
  ctx.session.broadcast.media = ctx.message.photo.at(-1).file_id;
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('Media uchun izoh yuboring:');
});

bot.on('animation', async (ctx) => {
  if (await handleJoinWelcomeMedia(ctx, 'animation', ctx.message.animation.file_id)) return;
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') {
    return ctx.reply('Bu turdagi media xabar qabul qilinmaydi.');
  }
  ctx.session.broadcast.mediaType = 'animation';
  ctx.session.broadcast.media = ctx.message.animation.file_id;
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('Media uchun izoh yuboring:');
});

bot.on('message', async (ctx, next) => {
  const sharedChat = ctx.message.chat_shared;
  if (!sharedChat) return next();
  return handleSharedRequiredChat(ctx, sharedChat);
});

bot.on('text', async (ctx) => {
  const rawText = ctx.message.text;
  const value = rawText.trim();
  const step = ctx.session?.step;
  if (value === '❌ Bekor qilish' && pendingChatSelections.size) {
    const userId = Number(ctx.from?.id);
    if ([...pendingChatSelections.values()].some((request) => request.userId === userId)) {
      clearChatSelections(userId);
      ctx.session = { adminPanelActive: true };
      return ctx.telegram.sendMessage(userId, 'Kanal/guruh tanlash bekor qilindi.', {
        reply_markup: { remove_keyboard: true }
      });
    }
  }
  if (step === 'join_welcome_text') {
    if (value.toLowerCase() === '/cancel') {
      reset(ctx);
      return ctx.reply('Salomlashuv matnini tahrirlash bekor qilindi.');
    }
    if (ctx.chat?.type !== 'private') {
      return ctx.reply('Salomlashuv matnini botning shaxsiy chatida yuboring yoki /cancel bosing.');
    }
    if (value.startsWith('/')) {
      return ctx.reply('Matn yuboring yoki /cancel bosing.');
    }
    const chat = await authorizeJoinWelcomeEdit(ctx);
    if (!chat) {
      reset(ctx);
      return ctx.reply('Chatni boshqarish huquqingiz yo\'q yoki chat uzilgan.');
    }
    const draft = ctx.session.joinWelcomeDraft;
    if (!draft) {
      reset(ctx);
      return ctx.reply('Salomlashuv tahrirlash muddati tugagan. Qaytadan boshlang.');
    }
    const prefixLength = `${chat.title || chat.username || 'Kanal'} ga xush kelibsiz. `.length;
    const maxLength = (draft.mediaFileId ? 1024 : 4096) - prefixLength;
    if (!value || rawText.length > maxLength) {
      return ctx.reply(`Salomlashuv 1–${maxLength} belgi bo\'lishi kerak. Qayta yuboring yoki /cancel bosing.`);
    }
    draft.message = rawText;
    draft.entities = ctx.message.entities || [];
    ctx.session.step = 'join_welcome_controls';
    return ctx.reply('Salomlashuv tayyor. Avval preview qilib, so\'ng saqlashingiz mumkin.', joinWelcomeDraftKeyboard());
  }
  if (step === 'join_welcome_button_text') {
    if (value.toLowerCase() === '/cancel') {
      ctx.session.step = 'join_welcome_controls';
      return ctx.reply('Tugma qo\'shish bekor qilindi.', joinWelcomeDraftKeyboard());
    }
    const label = inlineButtonLabel(rawText, ctx.message.entities);
    if (label.error) return ctx.reply(`${label.error} Qayta yuboring:`);
    if (!label.text || label.text.length > 64 || label.text.startsWith('/')) {
      return ctx.reply('Tugma matni 1–64 belgi bo\'lishi kerak:');
    }
    ctx.session.pendingJoinWelcomeButtonText = label.text;
    ctx.session.pendingJoinWelcomeButtonEmojiId = label.iconCustomEmojiId;
    ctx.session.step = 'join_welcome_button_type';
    return ctx.reply('Tugma turini tanlang:', joinWelcomeButtonTypeKeyboard());
  }
  if (step === 'join_welcome_button_type') {
    if (value.toLowerCase() === '/cancel') {
      delete ctx.session.pendingJoinWelcomeButtonText;
      ctx.session.step = 'join_welcome_controls';
      return ctx.reply('Tugma qo\'shish bekor qilindi.', joinWelcomeDraftKeyboard());
    }
    if (!['url', 'web_app'].includes(value)) {
      return ctx.reply('Tugma turini quyidagi tugmalar yordamida tanlang:');
    }
    ctx.session.pendingJoinWelcomeButtonType = value;
    if (value === 'web_app') {
      ctx.session.pendingJoinWelcomeButtonUrl = getWebAppUrl();
      ctx.session.step = 'join_welcome_button_color';
      return ctx.reply('Tugma rangini tanlang:', joinWelcomeColorKeyboard());
    }
    ctx.session.step = 'join_welcome_button_url';
    return ctx.reply('Tugma havolasini yuboring (http:// yoki https://):');
  }
  if (step === 'join_welcome_button_url') {
    if (value.toLowerCase() === '/cancel') {
      delete ctx.session.pendingJoinWelcomeButtonText;
      delete ctx.session.pendingJoinWelcomeButtonType;
      ctx.session.step = 'join_welcome_controls';
      return ctx.reply('Tugma qo\'shish bekor qilindi.', joinWelcomeDraftKeyboard());
    }
    if (!isHttpUrl(value)) return ctx.reply('Havola http:// yoki https:// bilan boshlanishi kerak. Qayta yuboring:');
    ctx.session.pendingJoinWelcomeButtonUrl = value;
    ctx.session.step = 'join_welcome_button_color';
    return ctx.reply('Tugma rangini tanlang:', joinWelcomeColorKeyboard());
  }
  if (value === 'Kanal/guruh ulash') {
    if (ctx.chat?.type !== 'private') {
      return ctx.reply('Kanal yoki guruh ulash uchun botning shaxsiy chatidagi Start tugmasidan foydalaning.');
    }
    return openJoinRequestChatPicker(ctx);
  }
  if (value === 'Ulangan kanallar ro\'yxati') return showJoinRequestChats(ctx);
  if (value === 'Yordam') return ctx.reply(configuredMessage('help', ctx), replyOptions());
  if (step === 'live_stream_title') {
    if (value.toLowerCase() === '/cancel') {
      reset(ctx);
      return ctx.reply('Jonli efir sozlash bekor qilindi.', adminKeyboard(ctx));
    }
    if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) {
      reset(ctx);
      return ctx.reply('Ruxsat yo\'q.');
    }
    if (ctx.chat?.type !== 'private') {
      return ctx.reply('Efir nomini botning shaxsiy chatida kiriting yoki /cancel bosing.');
    }
    const title = value.trim();
    if (!title || title.length > 100 || title.startsWith('/')) {
      return ctx.reply('Efir nomi 1–100 belgi bo‘lishi kerak. Qayta yuboring yoki /cancel bosing.');
    }
    const draft = ctx.session.liveStreamDraft;
    if (!draft) {
      reset(ctx);
      return ctx.reply('Efir sozlash muddati tugagan. Admin paneldan qaytadan boshlang.');
    }
    const savedStream = await saveSoccerLiveStream(ctx, { ...draft, title, match: null });
    reset(ctx);
    const streamUrl = getMiniAppLiveStreamUrl(savedStream.id);
    return ctx.reply(
      `✅ “${savedStream.title}” nomli jonli efir yoqildi.\nMini App havolasi: ${streamUrl}`,
      Markup.inlineKeyboard([[
        Markup.button.webApp('▶️ Jonli efirni ochish', streamUrl)
      ]])
    );
  }
  if (step === 'live_stream_url') {
    if (value.toLowerCase() === '/cancel') {
      reset(ctx);
      return ctx.reply('Jonli efir havolasini kiritish bekor qilindi.', adminKeyboard(ctx));
    }
    if (!isAdmin(ctx) || !hasPermission(ctx, 'settings')) {
      reset(ctx);
      return ctx.reply('Ruxsat yo\'q.');
    }
    if (ctx.chat?.type !== 'private') {
      return ctx.reply('Efir havolasini botning shaxsiy chatida kiriting yoki /cancel bosing.');
    }
    const stream = normalizeSoccerLiveStream(value);
    if (!stream) {
      return ctx.reply(
        'Havola noto‘g‘ri. YouTube efir havolasini yoki HTTPS HLS (.m3u8) manzilini yuboring. Bekor qilish uchun /cancel bosing.'
      );
    }
    ctx.session.liveStreamDraft = stream;
    ctx.session.step = 'live_stream_match_choice';
    return ctx.reply(
      'Efir qaysi o‘yin yoki nom bilan ko‘rsatilsin?',
      Markup.inlineKeyboard([
        [Markup.button.callback('⚽ Yaqin 30 daqiqadagi o‘yinni tanlash', 'admin:stream_auto_match')],
        [Markup.button.callback('✍️ O‘zim nom beraman', 'admin:stream_custom_title')],
        [Markup.button.callback('❌ Bekor qilish', 'admin:stream_cancel')]
      ])
    );
  }
  if (value.startsWith('/')) {
    reset(ctx);
    return ctx.reply(isAdmin(ctx) ? 'Bu command mavjud emas.' : 'Bu command mavjud emas.');
  }
  if (/^(?:Admin panel|🛠 Admin panel)$/.test(value)) {
    if (!isAdmin(ctx)) return ctx.reply('Ruxsat yo\'q.');
    activateAdminPanel(ctx);
    return ctx.reply('Admin panel', adminKeyboard(ctx));
  }
  if (step === 'broadcast_caption') {
    ctx.session.broadcast.caption = rawText;
    ctx.session.broadcast.captionEntities = ctx.message.entities || [];
    ctx.session.step = 'broadcast_buttons';
    return ctx.reply('Inline tugma qo\'shasizmi?', broadcastButtonKeyboard());
  }
  if (step === 'broadcast_button_text') {
    const label = inlineButtonLabel(rawText, ctx.message.entities);
    if (label.error) return ctx.reply(`${label.error} Qayta yuboring:`);
    if (!label.text || label.text.length > 64 || label.text.startsWith('/')) {
      return ctx.reply('Tugma matni 1–64 belgi bo\'lishi kerak:');
    }
    ctx.session.pendingButtonText = label.text;
    ctx.session.pendingButtonEmojiId = label.iconCustomEmojiId;
    ctx.session.step = 'broadcast_button_type';
    return ctx.reply('Tugma turini tanlang:', broadcastButtonTypeKeyboard());
  }
  if (step === 'broadcast_button_type') {
    const isKnownType = value === 'url' || value === 'web_app' || value === 'command';
    if (!isKnownType) return ctx.reply('Tugma turini quyidagi tugmalar yordamida tanlang:');
    ctx.session.pendingButtonType = value;
    if (value === 'command') {
      ctx.session.step = 'broadcast_button_command';
      return ctx.reply('Tugma bosilganda bajariladigan buyruqni tanlang:', broadcastCommandKeyboard());
    }
    if (value === 'web_app') {
      ctx.session.pendingButtonUrl = getWebAppUrl();
      ctx.session.step = 'broadcast_button_color';
      return ctx.reply('Tugma rangini tanlang:', broadcastColorKeyboard());
    }
    ctx.session.step = 'broadcast_button_url';
    return ctx.reply('Tugma havolasini yuboring (https://...):');
  }
  if (step === 'broadcast_button_url') {
    if (!isHttpUrl(value)) return ctx.reply('Havola http:// yoki https:// bilan boshlanishi kerak. Qayta yuboring:');
    ctx.session.pendingButtonUrl = value;
    ctx.session.step = 'broadcast_button_color';
    return ctx.reply('Tugma rangini tanlang:', broadcastColorKeyboard());
  }
  if (step === 'admin_add') {
    if (!isOwner(ctx)) return ctx.reply('Faqat asosiy admin yangi admin qo\'sha oladi.');
    if (!/^\d+$/.test(value)) return ctx.reply('Telegram ID faqat raqamlardan iborat bo\'lishi kerak:');
    const telegramId = Number(value);
    if (telegramId === ADMIN_TG_ID) return ctx.reply('Asosiy adminni qayta qo\'shib bo\'lmaydi.');
    const admin = await Admin.findOneAndUpdate(
      { telegramId },
      { $set: { active: true }, $setOnInsert: { telegramId, permissions: [] } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    adminRegistry.set(telegramId, admin);
    await logAdminAction(ctx, 'admin_added', String(telegramId));
    reset(ctx);
    return ctx.reply(`Admin qo\'shildi: ${telegramId}. Endi uning huquqlarini belgilang.`, adminKeyboard(ctx));
  }
  if (step === 'required_subscription_channel') {
    try {
      const channel = await checkFullAdmin(ctx, value);
      if (!data.settings.requiredChannels.some((item) => item.id === channel.id)) data.settings.requiredChannels.push(channel);
      await saveSettings();
      reset(ctx);
      ctx.session = { adminPanelActive: true };
      return ctx.reply(`${channel.title} majburiy obuna kanaliga qo'shildi.`, adminKeyboard(ctx));
    } catch (error) {
      return ctx.reply(error.message);
    }
  }
  return ctx.reply('Bu xabar uchun faol funksiya mavjud emas.', replyOptions());
});

bot.on('callback_query', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  reset(ctx);
});

bot.catch(async (error, ctx) => {
  console.error(`Update ${ctx.updateType} failed:`, error.response?.description || error.message);
  await safeAnswerCbQuery(ctx);
  try {
    if (ctx.from?.id) await ctx.telegram.sendMessage(ctx.from.id, '⚠️ Texnik xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.', { protect_content: !isAdmin(ctx) });
  } catch (replyError) {
    console.error('Error notification failed:', replyError.response?.description || replyError.message);
  }
});

async function safeAnswerCbQuery(ctx) {
  if (!ctx.callbackQuery) return;
  try { await ctx.answerCbQuery(); } catch {}
}

async function startBot() {
  config.validateConfig();

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10000
  });
  await Promise.all([
    SoccerMatchNotification.init(),
    SoccerMatchState.init()
  ]);

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Express server ${port} portda ishlayapti.`);
  });

  await hydrateSettings();
  await registerMainMenuCommands(bot.telegram);
  await bot.launch({
    allowedUpdates: ['message', 'channel_post', 'callback_query', 'chat_join_request', 'my_chat_member']
  });
  startSoccerMatchNotificationPolling();
  console.log('Movie bot ishga tushdi.');

  return server;
}

if (require.main === module) {
  startBot().catch((error) => {
    console.error('Bot startup failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  checkFullAdmin,
  createRequiredChatPickerKeyboard,
  fetchSoccerScoreboard,
  fetchSoccerMatchDetails,
  fetchSoccerStandings,
  findSoccerMatchesStartingWithin,
  getActiveLiveViewerCount,
  getMiniAppLiveStreamUrl,
  getMiniAppUrl,
  getMatchMiniAppUrl,
  findNextScheduledSoccerMatch,
  recordLiveStreamViewer,
  getSoccerMatchNotificationPhase,
  isSubscribedToSoccerMatch,
  editCallbackMessage,
  isValidScoreboardDate,
  mainMenuCommands,
  normalizeSoccerEvent,
  normalizeSoccerLiveStream,
  normalizeSavedSoccerLiveStreams,
  normalizeSoccerMatchDetails,
  normalizeSoccerStandings,
  openJoinRequestChatPicker,
  registerMainMenuCommands,
  defaultMessages,
  welcomeApplicationsMessage,
  welcomeApplicationsMarkup,
  welcomeMarkup,
  liveStreamsKeyboard,
  liveStreamsMessage,
  soccerLeagues,
  verifyMiniAppInitData
};

process.once('SIGINT', async () => {
  clearInterval(soccerMatchNotificationTimer);
  bot.stop('SIGINT');
  await mongoose.disconnect();
});
process.once('SIGTERM', async () => {
  clearInterval(soccerMatchNotificationTimer);
  bot.stop('SIGTERM');
  await mongoose.disconnect();
});
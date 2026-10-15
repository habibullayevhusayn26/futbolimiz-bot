const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { verifyMiniAppInitData } = require('./bot');

const botToken = 'test-bot-token';
const now = Date.UTC(2026, 9, 15, 5, 0, 0);

function createInitData(user, authDate = Math.floor(now / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'test-query',
    user: JSON.stringify(user)
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

test('accepts valid, recent Telegram Mini App initData', () => {
  const user = { id: 12345, first_name: 'Test', username: 'test_user' };
  const result = verifyMiniAppInitData(createInitData(user), botToken, now);

  assert.deepEqual(result, { authDate: Math.floor(now / 1000), user });
});

test('rejects tampered, stale, or invalid-user initData', () => {
  const valid = createInitData({ id: 12345, first_name: 'Test' });
  const tampered = new URLSearchParams(valid);
  tampered.set('user', JSON.stringify({ id: 54321, first_name: 'Changed' }));
  const stale = createInitData({ id: 12345 }, Math.floor(now / 1000) - 24 * 60 * 60 - 1);
  const invalidUser = createInitData({ id: '12345' });
  const nullUser = createInitData(null);

  assert.equal(verifyMiniAppInitData(tampered.toString(), botToken, now), null);
  assert.equal(verifyMiniAppInitData(stale, botToken, now), null);
  assert.equal(verifyMiniAppInitData(invalidUser, botToken, now), null);
  assert.equal(verifyMiniAppInitData(nullUser, botToken, now), null);
});

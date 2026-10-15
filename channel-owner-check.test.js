const assert = require('node:assert/strict');
const test = require('node:test');
const { checkFullAdmin } = require('./bot');

function createContext({ userStatus = 'creator', botStatus = 'administrator' } = {}) {
  const calls = [];
  const ctx = {
    from: { id: 123 },
    telegram: {
      getChat: async (chatId) => {
        calls.push(['getChat', chatId]);
        return { id: -1001234567890, type: 'channel', title: 'Private channel', username: '' };
      },
      getChatMember: async (chatId, userId) => {
        calls.push(['getChatMember', chatId, userId]);
        return userId === 123
          ? { status: userStatus }
          : { status: botStatus, can_post_messages: true, can_invite_users: true };
      },
      getMe: async () => ({ id: 456 }),
      createChatInviteLink: async (chatId) => {
        calls.push(['createChatInviteLink', chatId]);
        return { invite_link: 'https://t.me/+private-invite' };
      }
    }
  };
  return { ctx, calls };
}

test('accepts a private channel ID and creates an invite link for subscribers', async () => {
  const { ctx, calls } = createContext();
  const channel = await checkFullAdmin(ctx, '-1001234567890');

  assert.deepEqual(channel, {
    id: -1001234567890,
    title: 'Private channel',
    username: '',
    inviteLink: 'https://t.me/+private-invite'
  });
  assert.deepEqual(calls[0], ['getChat', -1001234567890]);
  assert.ok(calls.some(([method]) => method === 'createChatInviteLink'));
});

test('requires the user adding the channel to be its owner or administrator', async () => {
  const { ctx, calls } = createContext({ userStatus: 'member' });

  await assert.rejects(
    checkFullAdmin(ctx, '-1001234567890'),
    /kanalda admin yoki ega/
  );
  assert.equal(calls.some(([method]) => method === 'createChatInviteLink'), false);
});

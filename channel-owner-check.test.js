const assert = require('node:assert/strict');
const test = require('node:test');
const { checkFullAdmin, createRequiredChatPickerKeyboard } = require('./bot');

function createContext({
  userStatus = 'creator',
  botStatus = 'administrator',
  chatType = 'channel'
} = {}) {
  const calls = [];
  const ctx = {
    from: { id: 123 },
    telegram: {
      getChat: async (chatId) => {
        calls.push(['getChat', chatId]);
        return { id: -1001234567890, type: chatType, title: 'Private channel', username: '' };
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
    type: 'channel',
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

test('supports adding a private group as a required subscription chat', async () => {
  const { ctx } = createContext({ chatType: 'supergroup' });
  const chat = await checkFullAdmin(ctx, '-1001234567890');

  assert.equal(chat.type, 'supergroup');
  assert.equal(chat.inviteLink, 'https://t.me/+private-invite');
});

test('offers Telegram chat selection buttons that request bot admin rights', () => {
  const keyboard = createRequiredChatPickerKeyboard(11, 22);

  assert.equal(keyboard.keyboard[0][0].request_chat.chat_is_channel, true);
  assert.equal(keyboard.keyboard[1][0].request_chat.chat_is_channel, false);
  for (const row of keyboard.keyboard.slice(0, 2)) {
    const requestChat = row[0].request_chat;
    const botRights = requestChat.bot_administrator_rights;
    const userRights = requestChat.user_administrator_rights;
    assert.deepEqual(Object.keys(botRights).sort(), Object.keys(userRights).sort());
    assert.equal(botRights.can_manage_chat, true);
    assert.equal(botRights.can_invite_users, true);
    assert.equal(botRights.is_anonymous, false);
    assert.equal(Object.hasOwn(requestChat, 'request_title'), false);
    assert.equal(Object.hasOwn(requestChat, 'request_username'), false);
  }
  assert.equal(keyboard.keyboard[0][0].request_chat.bot_administrator_rights.can_post_messages, false);
  assert.equal(Object.hasOwn(keyboard.keyboard[1][0].request_chat.bot_administrator_rights, 'can_post_messages'), false);
});

test('requests delete and invite rights when selecting a chat for join-request management', () => {
  const keyboard = createRequiredChatPickerKeyboard(11, 22, 'join_requests');

  for (const row of keyboard.keyboard.slice(0, 2)) {
    const rights = row[0].request_chat.bot_administrator_rights;
    assert.equal(rights.can_delete_messages, true);
    assert.equal(rights.can_invite_users, true);
  }
});

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  checkFullAdmin,
  createRequiredChatPickerKeyboard,
  defaultMessages,
  mainMenuCommands,
  openJoinRequestChatPicker,
  registerMainMenuCommands,
  welcomeApplicationsMessage,
  welcomeApplicationsMarkup,
  welcomeMarkup
} = require('./bot');

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

test('/connect opens the chat picker with join-request management rights', async () => {
  const calls = [];
  const ctx = {
    from: { id: 123 },
    chat: { id: 123, type: 'private' },
    telegram: {
      sendMessage: async (...args) => calls.push(args)
    },
    reply: async (text) => calls.push([text])
  };

  await openJoinRequestChatPicker(ctx);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 123);
  const keyboard = calls[0][2].reply_markup.keyboard;
  assert.equal(keyboard[0][0].request_chat.chat_is_channel, true);
  assert.equal(keyboard[1][0].request_chat.chat_is_channel, false);
  assert.equal(keyboard[0][0].request_chat.bot_administrator_rights.can_delete_messages, true);
});

test('registers a slash command for every main menu action', async () => {
  const calls = [];
  await registerMainMenuCommands({
    setMyCommands: async (commands) => calls.push(commands)
  });

  assert.deepEqual(
    mainMenuCommands.map(({ command }) => command),
    ['start', 'app', 'connect', 'mychats', 'help', 'admin']
  );
  assert.deepEqual(calls, [mainMenuCommands]);
});

test('places chat connection and linked chat list under the green Zayafka button', () => {
  const startKeyboard = welcomeMarkup({ from: { id: 123 } }).inline_keyboard;
  const zayafkaButton = startKeyboard.flat().find((button) => button.callback_data === 'welcome:applications');
  const submenu = welcomeApplicationsMarkup().inline_keyboard;

  assert.equal(zayafkaButton.text, '📝 Zayafka');
  assert.equal(zayafkaButton.style, 'success');
  assert.equal(startKeyboard.flat().some((button) => button.callback_data === 'welcome:join_chat_connect'), false);
  assert.equal(startKeyboard.flat().some((button) => button.callback_data === 'welcome:required_list'), false);
  assert.equal(submenu.flat().find((button) => button.callback_data === 'welcome:join_chat_connect').style, 'success');
  assert.equal(submenu.flat().find((button) => button.callback_data === 'welcome:required_list').style, 'success');
  assert.ok(submenu.flat().some((button) => button.callback_data === 'welcome:back'));
});

test('keeps channel connection instructions in Zayafka and gives Start a football welcome', () => {
  assert.match(welcomeApplicationsMessage(), /Kanal yoki guruhingizni ulash/);
  assert.match(welcomeApplicationsMessage(), /\/connect/);
  assert.match(welcomeApplicationsMessage(), /\/mychats/);
  assert.match(defaultMessages.welcome, /jonli hisoblar/i);
  assert.match(defaultMessages.welcome, /o‘yin tafsilotlari/i);
  assert.doesNotMatch(defaultMessages.welcome, /\/connect|\/mychats/);
  assert.doesNotMatch(defaultMessages.welcome, /Kanal\/guruh ulash/);
});

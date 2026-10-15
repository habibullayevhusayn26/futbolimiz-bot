const assert = require('node:assert/strict');
const test = require('node:test');
const { editCallbackMessage } = require('./bot');

function createContext(message) {
  const calls = [];
  const ctx = {
    callbackQuery: { message },
    editMessageText: async (...args) => calls.push(['text', ...args]),
    editMessageCaption: async (...args) => calls.push(['caption', ...args])
  };
  return { ctx, calls };
}

test('edits the existing text message and removes send-only options', async () => {
  const { ctx, calls } = createContext({ text: 'Menu' });
  await editCallbackMessage(ctx, 'Updated menu', {
    parse_mode: 'HTML',
    protect_content: true,
    reply_markup: { inline_keyboard: [] }
  });

  assert.deepEqual(calls, [[
    'text',
    'Updated menu',
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }
  ]]);
});

test('edits an existing media caption instead of sending a new message', async () => {
  const { ctx, calls } = createContext({ photo: [{ file_id: 'photo-id' }], caption: 'Menu' });
  await editCallbackMessage(ctx, 'Updated menu');

  assert.deepEqual(calls, [['caption', 'Updated menu', {}]]);
});

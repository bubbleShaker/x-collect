#!/usr/bin/env node
import { McpClient } from './src/mcpClient.mjs';
import { splitNewInPage, maxId } from './src/incremental.mjs';
import { loadState, saveState, appendTweets } from './src/cache.mjs';

// 1以上の整数だけ受け付け、不正値(NaN/0/負)は既定にフォールバックする。
// （未検証だと "abc"→NaN で while ループが一度も回らず、無収集を成功と誤表示する）
function positiveIntEnv(value, def) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : def;
}

// 初回バックフィル時に履歴を遡りすぎて課金が膨らむのを防ぐ上限(ページ数)。
// 定期収集(2回目以降)は early-stop で通常1ページで止まるので、この上限には達しない。
const MAX_PAGES = positiveIntEnv(process.env.X_COLLECT_MAX_PAGES, 10);
const INCLUDE_REPLIES = process.env.X_COLLECT_INCLUDE_REPLIES === 'true';

/**
 * 1ユーザーの新着トップレベルツイートを差分収集する。
 * - 前回の lastMaxId より新しいものだけを取得
 * - ページングの途中で既知 ID に当たったら停止(early-stop)＝再取得(課金)を避ける
 */
async function collect(userName) {
  const apiKey = process.env.TWITTERAPI_IO_API_KEY || process.env.TWITTERAPI_API_KEY;
  const state = await loadState(userName);
  const client = new McpClient({ apiKey });
  const newTweets = [];
  let pages = 0;
  let reachedKnown = false;

  try {
    await client.init();
    let cursor;
    while (pages < MAX_PAGES) {
      const args = { userName, includeReplies: INCLUDE_REPLIES };
      if (cursor) args.cursor = cursor;

      const resp = await client.callTool('get_user_last_tweets', args);
      const tweets = resp?.data?.tweets ?? []; // 本体は data.tweets（pin_tweet は別枠なので無視）
      pages++;

      const { newOnes, reachedKnown: hit } = splitNewInPage(tweets, state.lastMaxId);
      newTweets.push(...newOnes);
      if (hit) { reachedKnown = true; break; }

      // 次ページ判定。has_next_page と next_cursor の両方が揃って初めて続行する。
      if (resp?.has_next_page !== true || !resp?.next_cursor || tweets.length === 0) break;
      cursor = resp.next_cursor;
    }

    await appendTweets(userName, newTweets);
    const newMax = maxId(newTweets.map((t) => t.id), state.lastMaxId);
    await saveState({
      userName,
      userId: newTweets[0]?.author?.id ?? state.userId ?? null,
      lastMaxId: newMax,
      count: (state.count ?? 0) + newTweets.length,
      updatedAt: new Date().toISOString(),
    });

    return { newCount: newTweets.length, pages, reachedKnown, lastMaxId: newMax };
  } finally {
    client.close();
  }
}

const userName = process.argv[2];
if (!userName) {
  console.error('usage: node collect.mjs <userName>');
  console.error('  env: X_COLLECT_MAX_PAGES(default 10), X_COLLECT_INCLUDE_REPLIES(default false)');
  process.exit(2);
}

collect(userName)
  .then((r) => {
    console.log(
      `[x-collect] @${userName}: 新着 ${r.newCount} 件 ` +
      `(pages=${r.pages}, early-stop=${r.reachedKnown}, lastMaxId=${r.lastMaxId})`
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error('[x-collect] ERROR:', e.message);
    process.exit(1);
  });

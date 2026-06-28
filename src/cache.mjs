import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 保存先は project 直下の data/（.gitignore 済み = 実データは公開しない）。
const SRC_DIR = path.dirname(fileURLToPath(import.meta.url)); // .../src
const DATA_DIR = path.resolve(SRC_DIR, '..', 'data');
const STATE_DIR = path.join(DATA_DIR, 'state'); // 収集位置(lastMaxId 等)
const TWEETS_DIR = path.join(DATA_DIR, 'tweets'); // 収集した本文(NDJSON)

// userName をファイル名に使うので、英数_以外を除去（パストラバーサル等の防止）。
// 例: '../../etc/passwd' → '_________etc_passwd'（区切り文字や . が消えて外に出られない）
export function safeName(userName) {
  return String(userName).replace(/[^A-Za-z0-9_]/g, '_');
}

/** 収集状態を読む。無ければ初期状態(lastMaxId=null)を返す。 */
export async function loadState(userName) {
  const f = path.join(STATE_DIR, `${safeName(userName)}.json`);
  if (!existsSync(f)) {
    return { userName, userId: null, lastMaxId: null, count: 0, updatedAt: null };
  }
  return JSON.parse(await readFile(f, 'utf8'));
}

/** 収集状態を書く。 */
export async function saveState(state) {
  await mkdir(STATE_DIR, { recursive: true });
  const f = path.join(STATE_DIR, `${safeName(state.userName)}.json`);
  await writeFile(f, JSON.stringify(state, null, 2) + '\n');
}

/** 新着ツイートを NDJSON(1行1ツイート)で追記する。空なら何もしない。 */
export async function appendTweets(userName, tweets) {
  if (!tweets || tweets.length === 0) return;
  await mkdir(TWEETS_DIR, { recursive: true });
  const f = path.join(TWEETS_DIR, `${safeName(userName)}.ndjson`);
  const lines = tweets.map((t) => JSON.stringify(t)).join('\n') + '\n';
  await appendFile(f, lines);
}

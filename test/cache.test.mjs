import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeName } from '../src/cache.mjs';

test('safeName: パストラバーサル文字を無害化する（区切りや . を残さない）', () => {
  const out = safeName('../../etc/passwd');
  assert.doesNotMatch(out, /[./\\]/); // スラッシュ・バックスラッシュ・ドットを残さない
  assert.equal(out, '______etc_passwd'); // '../../' の6文字が _ 6個になる
});

test('safeName: 正常な screen name はそのまま', () => {
  assert.equal(safeName('elonmusk'), 'elonmusk');
  assert.equal(safeName('d_bubble_shaker'), 'd_bubble_shaker');
});

test('safeName: 英数_以外（@ や空白など）は _ に置換', () => {
  assert.equal(safeName('@elon musk'), '_elon_musk');
});

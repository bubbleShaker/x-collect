import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareId, splitNewInPage, maxId } from '../src/incremental.mjs';

test('compareId は BigInt で大小比較する（大きな snowflake でも正確）', () => {
  assert.equal(compareId('100', '99'), 1);
  assert.equal(compareId('99', '100'), -1);
  assert.equal(compareId('100', '100'), 0);
  // Number に丸めると等しく見えてしまう隣接 ID も BigInt なら区別できる
  assert.equal(compareId('2071074073401229758', '2071074073401229757'), 1);
});

test('splitNewInPage: lastMaxId より新しいものだけ採用し、既知 ID で early-stop する', () => {
  const page = [{ id: '105' }, { id: '104' }, { id: '103' }, { id: '102' }];
  const r = splitNewInPage(page, '103');
  assert.deepEqual(r.newOnes.map((t) => t.id), ['105', '104']);
  assert.equal(r.reachedKnown, true);
});

test('splitNewInPage: 既知 ID に当たらなければ reachedKnown=false（次ページへ続行）', () => {
  const page = [{ id: '105' }, { id: '104' }];
  const r = splitNewInPage(page, '100');
  assert.deepEqual(r.newOnes.map((t) => t.id), ['105', '104']);
  assert.equal(r.reachedKnown, false);
});

test('splitNewInPage: 初回(lastMaxId=null)は全件を新着とみなす', () => {
  const page = [{ id: '3' }, { id: '2' }, { id: '1' }];
  const r = splitNewInPage(page, null);
  assert.equal(r.newOnes.length, 3);
  assert.equal(r.reachedKnown, false);
});

test('splitNewInPage: 先頭がすでに既知なら新着0件で即停止', () => {
  const page = [{ id: '100' }, { id: '99' }];
  const r = splitNewInPage(page, '100');
  assert.deepEqual(r.newOnes, []);
  assert.equal(r.reachedKnown, true);
});

test('maxId: 最大の id を返す／空なら fallback', () => {
  assert.equal(maxId(['101', '105', '103']), '105');
  assert.equal(maxId(['2071074073401229757', '2071074073401229758']), '2071074073401229758');
  assert.equal(maxId([], null), null);
  assert.equal(maxId([], '999'), '999');
});

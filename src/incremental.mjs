// 差分収集の純粋ロジック（IO なし＝テスト容易）。
//
// ツイート ID(snowflake) は時系列で単調増加する数値文字列。桁が大きく、JS の Number
// (倍精度浮動小数) だと 2^53 を超えて精度が落ちるので、比較は BigInt で行う。
//   注: BigInt は任意精度整数。'123n' のように扱え、大きな ID も正確に比較できる。

/**
 * id 文字列を BigInt で比較する。a>b:1, a<b:-1, a==b:0
 * @param {string} a @param {string} b
 */
export function compareId(a, b) {
  const x = BigInt(a);
  const y = BigInt(b);
  return x > y ? 1 : x < y ? -1 : 0;
}

/**
 * 1ページ分のツイート(作成日時の降順=ID降順)から、lastMaxId より新しいものだけを切り出す。
 * 既知 ID(<= lastMaxId)に当たった時点で reachedKnown=true を返す。
 * 呼び出し側はこれを見てページングを止める(early-stop)＝履歴の深掘り再取得(=課金)を避ける。
 * lastMaxId が null/undefined（初回収集）なら全件を新着とみなす。
 *
 * @param {{id:string}[]} tweets 降順に並んだ1ページ分
 * @param {string|null|undefined} lastMaxId 前回までに収集済みの最大 ID
 * @returns {{newOnes:{id:string}[], reachedKnown:boolean}}
 */
export function splitNewInPage(tweets, lastMaxId) {
  const newOnes = [];
  const hasFloor = lastMaxId !== null && lastMaxId !== undefined;
  for (const t of tweets) {
    if (hasFloor && compareId(t.id, lastMaxId) <= 0) {
      return { newOnes, reachedKnown: true };
    }
    newOnes.push(t);
  }
  return { newOnes, reachedKnown: false };
}

/**
 * id 配列の最大値(文字列)を返す。空配列なら fallback をそのまま返す。
 * @param {string[]} ids @param {string|null} fallback
 */
export function maxId(ids, fallback = null) {
  let m = fallback;
  for (const id of ids) {
    if (m === null || m === undefined || compareId(id, m) > 0) m = id;
  }
  return m;
}

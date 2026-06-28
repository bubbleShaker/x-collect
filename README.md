# x-collect

TwitterAPI.io の公式 MCP server を使って、**1ユーザーの新着ツイートを差分収集**する小さな CLI。
取得済みツイート ID をローカルにキャッシュし、**既知の地点に達したらページングを止める(early-stop)**ことで、
履歴の再取得（＝従量課金）を抑える。

> 関連: 設計・脅威モデル・コストは claude-config の `knowledge/twitterapi-mcp-*.md` を参照（Issue #29）。

## 仕組み

```
collect <userName>:
  1. data/state/<userName>.json から前回の lastMaxId を読む
  2. 公式 MCP(@kaitoinfra/twitterapi-io-mcp-server) を stdio で起動し get_user_last_tweets をページング
  3. id > lastMaxId のものだけ採用。既知 ID に当たったら即停止(early-stop)
  4. 新着を data/tweets/<userName>.ndjson に追記、lastMaxId を更新
```

取得は既存 MCP を再利用し、本ツールは **キャッシュ＋差分判定**に専念する（REST 自前実装はしない）。

## 必要なもの

- Node.js 24+（LTS Krypton。`package.json` の `engines` で下限を固定）
  - 依存パッケージはゼロ。標準機能のみ（`node:test` / `BigInt` / `fs/promises` / `child_process`）
  - 下限を 24 にした理由: `node --test` の安定は Node 20 以降で、開発・実行環境が現役 Active LTS の
    Node 24 のため。"動かす環境に合わせる"＋サポート最長（〜2028年4月頃）を優先した。
- 環境変数に TwitterAPI.io の API キー
  - `TWITTERAPI_IO_API_KEY`（公式 MCP が要求する名前）または `TWITTERAPI_API_KEY` のどちらか
  - 例: `setx TWITTERAPI_API_KEY "<key>"`（Windows・永続化）

## 使い方

```bash
node collect.mjs elonmusk
# 新着のみ data/tweets/elonmusk.ndjson に追記され、状態が data/state/elonmusk.json に保存される

npm test   # 差分ロジックの単体テスト
```

### オプション（環境変数）

| 変数 | 既定 | 説明 |
|---|---|---|
| `X_COLLECT_MAX_PAGES` | `10` | 初回バックフィルの最大ページ数（課金の上限ガード） |
| `X_COLLECT_INCLUDE_REPLIES` | `false` | リプライも収集対象に含める |

## コストの考え方（重要）

- 課金は**返却件数ベース**（ツイート $0.15/1,000件 ≈ 1件¥0.02）。
- 2回目以降の定期収集は early-stop で**通常1ページ(≈20件)で停止**するので、新着が無ければ
  毎回 ≈20件分（≈¥0.5）程度。**履歴を毎回フルに取り直す無駄を消す**のが本ツールの価値。
- `get_user_last_tweets` に since_id は無いため「1ページ分の最低取得」はゼロにはできない。
  完全な増分（1件も無駄取りしない）は将来の検索 `since:` 併用や REST 直叩きで詰める余地（後続）。

## データ

- `data/` は `.gitignore` 済み。収集した本文・状態は**コミットしない**。
- 形式: state は JSON、本文は NDJSON（1行1ツイート、追記専用）。
- 注意: NDJSON 追記 → state 更新の**間でプロセスが落ちると**、次回実行で同じツイートを
  重複追記しうる（`lastMaxId` が進まないため）。後段で読む時は ID で重複排除する前提。

## ステータス

v0.1: 単一ユーザーのタイムライン差分収集。複数ユーザー一括・検索ベース収集・SQLite 化は後続。

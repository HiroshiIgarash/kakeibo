# 移行実装計画 A/B/C クロス整合性レビュー

- 実施日: 2026-07-09
- 対象:
  - spec（唯一の正）: `docs/superpowers/specs/2026-07-09-rails-to-nextjs-migration-design.md`
  - 計画A: `docs/superpowers/plans/2026-07-09-migration-A-foundation.md`（基盤・純粋ロジック・テスト基盤）
  - 計画B: `docs/superpowers/plans/2026-07-09-migration-B-app-layer.md`（Server Actions・画面・認証）
  - 計画C: `docs/superpowers/plans/2026-07-09-migration-C-webhook-cleanup-deploy.md`（Webhook・掃除・デプロイ）
- 前提: 実行順 A→B→C。各計画の実装者は他計画の本文を読まず、A が確定させる「固定インターフェース」だけを共有して作業する、という運用を想定して突合した。

## 指摘サマリ

| # | 重大度 | 観点 | 対象 |
|---|---|---|---|
| F1 | BLOCKER | テスト基盤 | A Task1 vitest.config.ts（`@/` エイリアス未解決）|
| F2 | BLOCKER | インターフェース | `createTestDb` の戻り値が A/B/C で三者三様 |
| F3 | BLOCKER | パッケージマネージャ | B Task2 が `npm install zod`（pnpm ロックに載らずビルド不能）|
| F4 | MAJOR | インターフェース | B Task13a が `jstToday().getMonth()` で年月取得（JST 崩れ・spec §3.2 違反）|
| F5 | MAJOR | 削除 vs 編集 | `settings/page.tsx` を B・C が二重編集 |
| F6 | MAJOR | テスト整合 | C route.test の店舗名アサーションが全角ハイフン（NFKC 後は ASCII）|
| F7 | MAJOR | デプロイ順序 | C が `apps/api` 削除（Task6）後に移行スクリプト実行（Task8）＝ソースDB起動手段が消える |
| F8 | MINOR | proxy/middleware | C の CLAUDE.md が認証ファイルを `middleware.ts` と記述（実体は `proxy.ts`）|
| F9 | MINOR | パッケージマネージャ | B 全体が `npx vitest`/`npx tsc` を使用（A/C は pnpm）|
| F10 | MINOR | デプロイ手順 | C Task8 が `pnpm tsx` で移行実行（tsx 未依存・A は node 実行想定）|
| F11 | MINOR | デプロイ手順 | C Task8 の移行用 env 名が A 実装（RAILS_DATABASE_URL/DIRECT_URL）と不一致 |
| F12 | MINOR | 環境変数 | A `.env.example` が AUTH_* を「計画C で使用」と誤記（実体は計画B）|
| F13 | MINOR | 依存担当 | C Global Constraints が「依存追加は計画Aの担当」とするが zod は計画B が追加 |

- BLOCKER: 3 / MAJOR: 4 / MINOR: 6

---

## 観点1: A の固定インターフェースと B/C 消費側の整合

### F1 (BLOCKER): vitest が `@/` エイリアスを解決できない
- 対象: `apps/web/vitest.config.ts`（A Task1）、B の全 integration テスト、C Task1 route.test.ts
- 問題: A Task1 の vitest.config.ts には `resolve.alias` も `vite-tsconfig-paths` プラグインも無い。一方 B/C のテストは `@/db/schema`・`@/db/client`・`@/test/db`・`@/lib/*` を多用する。`tsconfig.json` に `@/*`→`./src/*` は存在する（実在確認済み）が、**vitest は tsconfig の paths を自動では読まない**ため、B/C のテストはモジュール解決エラーで全滅する。A 自身のテストは相対 import（`./dates`・`../test/db`）なので A だけは通り、レビューをすり抜けやすい。
- 修正提案: A Task1 の vitest.config.ts に `vite-tsconfig-paths` を導入するか `resolve: { alias: { '@': path.resolve(__dirname, './src') } }` を追加する。固定インターフェースを提供する A 側で対応するのが筋。

### F2 (BLOCKER): `createTestDb` の戻り値が三計画で不一致
- 対象: A Task4（`apps/web/src/test/db.ts`）、B Task3/5/6/7/8/9/10、C Task1
- 問題: A の実装は `createTestDb(): Promise<{ db, client }>`（後始末は `client.close()`）。しかし消費側の想定が食い違う。
  - 計画A: `({ db, client } = await createTestDb())` → `client.close()`
  - 計画B: `db = await createTestDb()` として**戻り値そのものを db として** `db.insert(...)` を呼ぶ（Task3 L154 ほか、Task5 以降は `const testDb = await createTestDb(); testDb.insert(...)`）。`{ db, client }` が返ると `db.insert`/`testDb.insert` が undefined になり、B の全 DB テストが落ちる。後始末も書かれず pglite がリークする。
  - 計画C: `const t = await createTestDb(); holder.current = t.db; teardown = t.teardown; ... await teardown()`（Task1 L128-137）。A は `teardown` を返さないため afterEach が `teardown is not a function` で例外。
- 両計画とも「戻り値が違えば import 行を合わせる」と注記するが、差異は import 行に留まらず（B は構造そのもの、C は後始末 API）、放置すると DB を伴う全テストが実行不能。**A のテスト API を B/C が正確に共有できていない**点が本レビュー最大の弱点。
- 修正提案: A の `createTestDb` を三者を満たす形（例: `Promise<{ db, client, teardown }>`、`teardown = () => client.close()`）に一本化し固定インターフェースとして明記。B は `const { db } = await createTestDb()`＋afterEach で `teardown()`、C は現行どおり `t.db`/`t.teardown` を使う形へ揃える。

### その他の固定インターフェース（問題なし）
- `parseSmbcEmail({from,subject,plain}) => {ok:true; amount; storeName; purchasedAt} | {ok:false; reason:'not_target'|'parse_error'; error?}`: A Task6・C Task1(L17,323) で完全一致。C の `reason` 分岐も網羅。**問題なし**。
- `evaluateAlertsForTransaction(tx, id)` / `refreshUnclassifiedAlert(tx)`: A Task8 のシグネチャと B Task5/9・C Task1 の呼び出し（いずれも `db.transaction(async (tx)=>...)` 内）が一致。category=null で no-op という契約も B/C 双方で整合。**問題なし**。
- `getMonthlySummary(db, year, month)` の戻り shape: A Task7 と B Task3 `loadMonthlySummaryView` の消費が整合（B は `percentage` を view から落とすが型上は把握済み）。**問題なし**。
- schema camelCase・`date` 列 `mode:'string'`（budgets.month/paceAlerts.month）・`timestamp` `mode:'date'`（purchasedAt 等）: B/C の消費（月キー文字列・日時 Date）と一致。**問題なし**。
- `calcBudgetPace({budgetAmount,spentAmount,date})`・dates 主要4関数: シグネチャ整合（ただし利用方法に F4）。

---

## 観点2: Next.js 16 対応（proxy.ts vs middleware.ts）

- 認証の主担当は計画B（Task11-12）。B は Global Constraint 8 で「Next 16 は `middleware.ts`→`proxy.ts`、関数名も `proxy`」と bundled docs 根拠付きで確定し `src/proxy.ts` を実装、matcher で `/login`・`/api/inbound-email`・`_next/*` を除外（L1508）。C は認証を明確にスコープ外とし（C L23）、Webhook はトークン検証のみ・cookie 対象外で整合。Node ランタイム前提も B の proxy・C の route（`runtime="nodejs"`）で一致。**動作面の伝播は矛盾なし**。

### F8 (MINOR): CLAUDE.md の認証ファイル記述が旧名
- 対象: C Task7 の CLAUDE.md 書き換え（L654）
- 問題: 書き換え後 CLAUDE.md が「認証: … Web Crypto API、`middleware.ts`」と記述するが、実体は B が `proxy.ts` として実装。唯一の情報源に旧名が残る。
- 修正提案: 当該行を `proxy.ts` に修正（spec §7 は "middleware.ts" だが、Next16 事情で proxy.ts に確定した B の判断を優先）。

---

## 観点3: C の削除リストが B の新規作成ファイルを消さないか

### F5 (MAJOR): `settings/page.tsx` を B と C が二重編集
- 対象: B（Global Constraint 9 + Task13d）、C Task5
- 問題: B（フェーズ4）と C（フェーズ7）が**同一編集**（`SETTINGS_SECTIONS` の「メール通知」項目削除＋`Mail` import 削除、両者とも "31〜36行目" を指す）を行う。実行順 B→C なので、C Task5 の exact-string 置換は削除済みの旧内容を探して**マッチせず失敗**する。
- 修正提案: 編集責任を「ナビ項目削除は B（画面担当）」に一本化。C Task5 からは settings/page.tsx の編集を外し、grep 確認のみ残す。C の削除本体（`settings/mail`・`mail-notification-content.tsx`・`use-immediate-toggle.ts`）はそのまま。

### providers.tsx / layout.tsx（問題なし・要順序遵守）
- B Task13n は `providers.tsx` を pass-through 化し layout の `<Providers>` を残置、C Task4 は `providers.tsx` を削除し `<Providers>` を撤去。**最終状態は一貫**（Providers 完全撤去）で、C Task4 の layout "before" ブロックは B 出力と一致。B→C 順を守れば衝突しない。**問題なし**。
- C の削除対象（gql/apollo-client/config.ts/codegen.ts、settings/mail 一式、apps/api）に **B の新規作成ファイルは一つも含まれない**（serialize/queries/notifications/actions*/auth/proxy/login はすべて安全）。**問題なし**。
- `notification-list.tsx` の `InboundEmail` 分岐追加は C が「B（フェーズ4）担当」と申し送り（C L24,827）、B Task13h が実施。責任分界が整合。**問題なし**。
- `toggle-switch.tsx` は C が「alert-settings と共有のため保持」と判断（C Task5）。B Task13k が alert-settings-content で ToggleSwitch を使うため整合。**問題なし**。

---

## 観点4: package.json 操作の衝突

### F3 (BLOCKER): B が npm でzodを追加し pnpm ロックに載らない
- 対象: B Task2（L116-118）
- 問題: リポジトリは pnpm ワークスペース（root に `pnpm-lock.yaml`、A も C も pnpm 前提）。B Task2 は `npm install zod` を実行し `apps/web/package-lock.json`（A が「触るな」と明記した npm 残骸）を更新・コミットする。これでは `pnpm-lock.yaml` に zod が反映されず、pnpm でインストールする Vercel/ローカルで **zod が入らず型チェック/ビルドが失敗**する。B 以降の全 Server Actions（zod 依存）が動かない。
- 修正提案: `pnpm --filter web add zod` に変更、コミット対象を `pnpm-lock.yaml` にする（`package-lock.json` は触らない）。

### scripts キーの衝突（問題なし）
- A Task1 が追加する `test`/`test:watch`/`db:generate`/`db:migrate` と、C Task4 が変更する `dev`・削除する `codegen` は**同一キーの奪い合いが無い**。依存の追加（A: drizzle 等 / B: zod）と削除（C: apollo/graphql/codegen）も対象が非重複で、A→B→C 順なら整合。**問題なし**（F3 のロック規律のみ要修正）。

---

## 観点5: パッケージマネージャの一貫性（pnpm）

### F9 (MINOR): 計画B が npx/npm を常用
- 対象: B 全タスク（`npx vitest run`・`npx tsc --noEmit`・Task2 `npm install`）
- 問題: A（`pnpm --filter web exec/add/run`）・C（`pnpm ...`）は pnpm 一貫だが B だけ npx/npm。`npx vitest`/`npx tsc` は pnpm 配置の `node_modules/.bin` を拾うため大半は動くが規律として不統一で、`npm install`（F3）は実害あり。
- 修正提案: B のコマンドを `pnpm --filter web exec vitest run` / `pnpm --filter web exec tsc --noEmit` / `pnpm --filter web add zod` に統一。

### F10 (MINOR): C の移行スクリプト実行が `pnpm tsx`（tsx 未依存）
- 対象: C Task8（L732 `pnpm tsx scripts/migrate-settings.ts`）
- 問題: A Task9 は `scripts/migrate-settings.ts` を **Node 26 のネイティブ TS 実行（`node scripts/migrate-settings.ts`）**で回す想定。`tsx` はどの計画でも依存追加しておらず `pnpm tsx` は解決できず失敗する。
- 修正提案: C Task8 のコマンドを `node scripts/migrate-settings.ts`（A の想定に合わせる）へ修正。tsx 採用なら A 側で devDependency 追加が必要。

### F11 (MINOR): 移行スクリプトの環境変数名が A 実装と不一致
- 対象: C Task8（L731 の例示 env）
- 問題: C の例示は `SOURCE_DATABASE_URL=ローカルRails, DATABASE_URL=Supabase` だが、A Task9 の実スクリプトは `RAILS_DATABASE_URL`（source）と `DIRECT_URL`（target）を読む。誤った env 名だと「未設定」エラーか、最悪 pooler 経由の誤 DB へ書く。C は「A 実装に合わせて渡す」と保険を掛けるが例示が誤導的。
- 修正提案: C Task8 の env 例を `RAILS_DATABASE_URL=... DIRECT_URL=... node scripts/migrate-settings.ts` に修正。

---

## 観点6: その他（前提抜け・テスト戦略・spec 乖離）

### F6 (MAJOR): C route.test の店舗名アサーションが全角ハイフン
- 対象: C Task1 route.test.ts（L176 `expect(tx[0].storeName).toBe("セブン－イレブン")`）
- 問題: A の `parseSmbcEmail` は抽出店舗名を **NFKC 正規化**して返す（A email-parser L866、A 自身のテストも `"セブン-イレブン"`＝ASCII ハイフンを期待）。C route.ts は `parsed.storeName`（正規化済み）をそのまま insert するため DB 上は ASCII ハイフン。しかし C のアサーションは全角ハイフン `U+FF0D`（バイト列 `ef bc 8d` を確認）で、**このテストは必ず失敗**する。
- 修正提案: C L176 を `"セブン-イレブン"`（ASCII ハイフン）へ修正。入力 `SEVEN_ELEVEN_PLAIN` は全角のままでよい（正規化は parser の責務）。BELC 系（ASCII 店名）は問題なし。

### F7 (MAJOR): `apps/api` 削除がデータ移行実行より前に来る
- 対象: C Task6（`rm -rf apps/api`）と C Task8（migrate-settings 実行）
- 問題: C のタスク順は Task6（掃除）< Task8（デプロイ・移行実行）。Task6 で `apps/api` を丸ごと削除するが、この配下には**ローカル Rails DB を起動する `docker-compose.yml`** が含まれる（C Task6 の削除リスト、C Task8 L729 のコメントも「旧 apps/api/docker-compose.yml 相当の Postgres」と明言）。Task8 の移行はこのローカル Rails DB（`RAILS_DATABASE_URL`）を source にするため、**先に compose を消すと source DB を起動する手段が失われる**。データ本体は Docker volume に残るとしても、起動用 compose が git からしか復元できなくなる。spec §12 ではデータ移行はフェーズ2（早期）だが、実行手順が C のフェーズ7-8（掃除の後）に置かれていることが根本原因。
- 修正提案: migrate-settings の実行（C Task8 の該当ステップ）を `apps/api` 削除（Task6）より前に完了させるよう順序を入れ替える。あるいは Task6 の直前に「Rails DB のダンプ取得 or compose 退避」を必須手順として明記する。

### F12 (MINOR): A `.env.example` の AUTH_* 帰属が誤り
- 対象: A Task1 `.env.example`（L83-84 コメント）
- 問題: `AUTH_PASSWORD`/`AUTH_COOKIE_SECRET` に「# 共有パスワード認証（計画C で使用）」とあるが、認証（proxy/login）は**計画B Task11-12** の担当（C は認証を明確にスコープ外と宣言）。`INBOUND_TOKEN` は計画C で正しい。
- 修正提案: 該当コメントを「計画B で使用」に修正。

### F13 (MINOR): C の「依存追加は計画Aの担当」が zod を取りこぼす
- 対象: C Global Constraints（L20）
- 問題: C は「`drizzle-orm`/`postgres`/`vitest`/`@electric-sql/pglite`/`zod` などの追加は行わない」「依存追加は計画Aの担当」と記すが、実際に zod を追加するのは**計画B Task2**（A ではない）。担当の記述が不正確。
- 修正提案: 「zod は計画B が追加、それ以外の runtime/dev 依存は計画A が追加」と正す。

### F4 (MAJOR): B Task13a が `jstToday()` から `getMonth()` で年月を取得
- 対象: B Task13a（`src/app/page.tsx` L1635-1637）、13b/13c の同型処理
- 問題: A の `jstToday()` は実装上 `new Date()` を返すだけで JST 補正を内包しない。B は `const year = today.getFullYear(); const month = today.getMonth()+1;` と**素の getter** で年月を取り出すが、これは実行環境TZ（Vercel は UTC）基準になり、JST の 15:00–24:00（UTC 日付が前日）にズレる。spec §3.2 の「日付演算は dates.ts 経由、`getMonth()` 直接使用禁止」にも違反。ズレた year/month が `getMonthlySummary` に渡り、月境界付近で誤った月のサマリーを表示する。
- 補足: A は補助関数 `jstDateParts(date)` を export しているが、B の Global Constraint（consume 可能関数リスト L21）は主要4関数のみ列挙し `jstDateParts` を落としているため、B 実装者がこれを使わない懸念がある。
- 修正提案: B の年月取得を `const { year, month } = jstDateParts(jstToday());` に統一し、B の consume 一覧に `jstDateParts` を追記。

### テスト戦略（pglite）の整合（おおむね問題なし）
- 3計画とも Vitest + `@electric-sql/pglite` で統一。純粋ロジック＝ユニット、DB 伴う処理＝pglite integration の切り分けも一致。A の生成マイグレーション（Task2 の `drizzle/0000`）を `createTestDb` が適用し B/C が依存する順序も正しい。**F1・F2 を除けば戦略自体は整合**。

### spec 乖離（重大なものなし）
- A schema は `purchased_at` を含む全 timestamp を `timestamptz`（spec §3.2 準拠）にし、spec §4.2 の「timestamp」表記の曖昧さを §3.2 側へ正しく寄せている。**妥当**。
- 非同期→同期実行（spec §5.5）、未分類再計算の追加経路（spec §5.6/§13、B Task9 mappings 再分類）、通知 union 合成（spec §8.1、B Task4+13h）はいずれも spec に沿って各計画へ正しく割り付けられている。

---

## 総評

3計画は spec を細部までよく分解し、責任分界（認証=B、Webhook/掃除/デプロイ=C、基盤=A）と申し送り（notification-list の InboundEmail 分岐、settings/mail の削除タイミング、toggle-switch 保持）はおおむね丁寧に設計されている。数式・状態遷移・丸め規則の移植も spec と整合している。

一方で最大の弱点は「**A のテスト基盤 API を B/C が正確に共有できていない**」ことで、BLOCKER 3件のうち2件（F1 vitest エイリアス未解決、F2 createTestDb 戻り値の三者不一致）がここに集中する。この2件を放置すると B/C の DB 統合テストは一つも実行できない。加えて F3（B の npm 混入）は pnpm ロックに zod が載らずビルドを止める。**この3つの BLOCKER は着手前に必ず解消すべき**で、いずれも修正は軽微（A 側で createTestDb を `{db,client,teardown}` に統一＋vitest エイリアス追加、B は `pnpm --filter web add zod`）。

最重要指摘は **F2（createTestDb の三者不一致）**。単なる import 名の差ではなく、戻り値の構造と後始末 API が計画ごとに異なり、B・C の全 DB テストを一律に破壊するため、A のインターフェース確定時に最優先で一本化すべきである。

MAJOR の F4（JST 年月取得）・F5（settings/page.tsx 二重編集）・F6（全角ハイフン アサーション）・F7（apps/api 削除順序）は実行時に確実に顕在化するが、いずれも局所修正・順序入替で解消できる。MINOR 群はドキュメント整合とデプロイ手順の表記ゆれが中心で、機能への実害は限定的。

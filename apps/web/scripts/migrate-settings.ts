/**
 * 1回きりの設定系データ移行スクリプト（Rails PostgreSQL → Supabase）。
 * 実行: RAILS_DATABASE_URL=... DIRECT_URL=... node apps/web/scripts/migrate-settings.ts
 * 履歴データ（取引・通知・アラート履歴）は移行しない。
 *
 * 移行対象: categories / budgets / store_category_mappings / budget_alert_settings / pace_alert_settings
 * ID は付け直すため、旧ID→新ID のマップ（categoryIdMap）を保持して外部キー参照を張り替える。
 *
 * 対象DBへの書き込みは単一トランザクションにまとめている。途中でエラーになった場合は
 * 全体がロールバックされるため、データ不備（例: store_name の null/重複）を Rails側で
 * 修正してから再実行すれば安全にやり直せる（categories 等が二重に増えたりしない）。
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  schema,
  categories,
  budgets,
  storeCategoryMappings,
  budgetAlertSettings,
  paceAlertSettings,
} from "../src/db/schema";

type Row = Record<string, unknown>;

async function main() {
  const railsUrl = process.env.RAILS_DATABASE_URL;
  const targetUrl = process.env.DIRECT_URL;
  if (!railsUrl) throw new Error("RAILS_DATABASE_URL is not set");
  if (!targetUrl) throw new Error("DIRECT_URL is not set");

  const src = postgres(railsUrl, { max: 1 });
  const targetClient = postgres(targetUrl, { max: 1 });
  const db = drizzle(targetClient, { schema });

  try {
    // ---- Rails側から読み込み（対象DBへの書き込みより先に全件読んでおく） ----
    const srcCategories = (await src`
      SELECT id, name, type, parent_id, color, sort_order
      FROM categories
      ORDER BY id
    `) as Row[];

    const srcBudgets = (await src`
      SELECT category_id, month, amount FROM budgets ORDER BY id
    `) as Row[];

    const srcMappings = (await src`
      SELECT category_id, store_name FROM store_category_mappings ORDER BY id
    `) as Row[];

    const srcBudgetSettings = (await src`
      SELECT category_id, threshold, threshold_2, is_active FROM budget_alert_settings ORDER BY id
    `) as Row[];

    const srcPaceSettings = (await src`
      SELECT category_id, threshold, active_from_day, is_active FROM pace_alert_settings ORDER BY id
    `) as Row[];

    // 旧ID → 新ID の対応表
    const categoryIdMap = new Map<number, number>();

    // 対象DBへの書き込みは1トランザクションにまとめる。途中で例外が起きれば全ロールバックされる。
    await db.transaction(async (tx) => {
      // ---- categories ----
      // 自己参照(parent_id)があるため、まず parent_id なしで全件挿入し、後で更新する。
      for (const c of srcCategories) {
        const kind = c.type === "FixedCategory" ? "fixed" : "variable";
        const [inserted] = await tx
          .insert(categories)
          .values({
            name: c.name as string,
            kind,
            parentId: null,
            color: (c.color as string | null) ?? null,
            sortOrder: (c.sort_order as number) ?? 0,
          })
          .returning({ id: categories.id });
        categoryIdMap.set(c.id as number, inserted.id);
      }

      // parent_id を新IDへ張り替える
      for (const c of srcCategories) {
        if (c.parent_id == null) continue;
        const newId = categoryIdMap.get(c.id as number)!;
        const newParentId = categoryIdMap.get(c.parent_id as number);
        if (newParentId == null) {
          throw new Error(`parent category not found for id=${c.id} parent_id=${c.parent_id}`);
        }
        await tx.update(categories).set({ parentId: newParentId }).where(eq(categories.id, newId));
      }

      // ---- budgets ----
      for (const b of srcBudgets) {
        const newCategoryId = requireMapped(categoryIdMap, b.category_id as number, "budgets");
        await tx.insert(budgets).values({
          categoryId: newCategoryId,
          month: toDateString(b.month),
          amount: b.amount as number,
        });
      }

      // ---- store_category_mappings ----
      // 新スキーマは store_name が NOT NULL + UNIQUE。Rails側は nullable かつ重複可のため、
      // null・空文字・重複が見つかった時点でエラーにして移行を止める（サイレントに欠落させない）。
      const seenStoreNames = new Set<string>();
      for (const m of srcMappings) {
        if (m.store_name == null) {
          throw new Error(
            `store_category_mappings に null の store_name があります (category_id=${m.category_id})。Rails側のデータを確認・修正してから再実行してください。`,
          );
        }
        const storeName = (m.store_name as string).trim().normalize("NFKC");
        if (storeName === "") {
          throw new Error(
            `store_category_mappings に空文字の store_name があります (category_id=${m.category_id})。Rails側のデータを確認・修正してから再実行してください。`,
          );
        }
        if (seenStoreNames.has(storeName)) {
          throw new Error(
            `store_category_mappings に重複する store_name があります: "${storeName}"。Rails側で名寄せしてから再実行してください。`,
          );
        }
        seenStoreNames.add(storeName);
        const newCategoryId = requireMapped(categoryIdMap, m.category_id as number, "store_category_mappings");
        await tx.insert(storeCategoryMappings).values({ categoryId: newCategoryId, storeName });
      }

      // ---- budget_alert_settings（category_id は nullable） ----
      for (const s of srcBudgetSettings) {
        const newCategoryId =
          s.category_id == null
            ? null
            : requireMapped(categoryIdMap, s.category_id as number, "budget_alert_settings");
        await tx.insert(budgetAlertSettings).values({
          categoryId: newCategoryId,
          threshold: s.threshold as number,
          threshold2: (s.threshold_2 as number | null) ?? null,
          isActive: (s.is_active as boolean) ?? true,
        });
      }

      // ---- pace_alert_settings（category_id は not null） ----
      for (const s of srcPaceSettings) {
        const newCategoryId = requireMapped(categoryIdMap, s.category_id as number, "pace_alert_settings");
        await tx.insert(paceAlertSettings).values({
          categoryId: newCategoryId,
          threshold: s.threshold as number,
          activeFromDay: (s.active_from_day as number) ?? 5,
          isActive: (s.is_active as boolean) ?? true,
        });
      }
    });

    console.log("migration done:", {
      categories: srcCategories.length,
      budgets: srcBudgets.length,
      storeCategoryMappings: srcMappings.length,
      budgetAlertSettings: srcBudgetSettings.length,
      paceAlertSettings: srcPaceSettings.length,
    });
  } finally {
    await src.end();
    await targetClient.end();
  }
}

function requireMapped(map: Map<number, number>, oldId: number, table: string): number {
  const newId = map.get(oldId);
  if (newId == null) throw new Error(`${table}: category id ${oldId} の新IDが見つかりません`);
  return newId;
}

// Rails の date カラムは Date か 'YYYY-MM-DD' 文字列で返りうる。'YYYY-MM-DD' へ正規化する。
function toDateString(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

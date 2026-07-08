import {
  pgTable,
  pgEnum,
  bigserial,
  bigint,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  text,
  index,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { PgDatabase, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";

export const categoryKind = pgEnum("category_kind", ["fixed", "variable"]);
export const transactionSource = pgEnum("transaction_source", ["email", "manual"]);
export const inboundEmailStatus = pgEnum("inbound_email_status", [
  "pending",
  "processed",
  "failed",
  "skipped",
]);

export const categories = pgTable(
  "categories",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: varchar("name").notNull(),
    kind: categoryKind("kind").notNull(),
    parentId: bigint("parent_id", { mode: "number" }).references(
      (): AnyPgColumn => categories.id,
    ),
    color: varchar("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_categories_parent_id").on(t.parentId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    amount: integer("amount").notNull(),
    memo: varchar("memo"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true, mode: "date" }).notNull(),
    storeName: varchar("store_name").notNull(),
    categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id),
    source: transactionSource("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_transactions_category_id").on(t.categoryId),
    index("idx_transactions_purchased_at").on(t.purchasedAt),
    index("idx_transactions_source").on(t.source),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryId: bigint("category_id", { mode: "number" })
      .notNull()
      .references(() => categories.id),
    month: date("month", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_budgets_category_month").on(t.categoryId, t.month)],
);

export const budgetAlertSettings = pgTable("budget_alert_settings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id),
  threshold: integer("threshold").notNull(),
  threshold2: integer("threshold_2"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryId: bigint("category_id", { mode: "number" })
      .notNull()
      .references(() => categories.id),
    month: date("month", { mode: "string" }).notNull(),
    threshold: integer("threshold").notNull(),
    usagePercent: integer("usage_percent").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("uq_budget_alerts_cat_month_threshold").on(t.categoryId, t.month, t.threshold)],
);

export const paceAlertSettings = pgTable("pace_alert_settings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  categoryId: bigint("category_id", { mode: "number" })
    .notNull()
    .references(() => categories.id),
  threshold: integer("threshold").notNull(),
  activeFromDay: integer("active_from_day").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paceAlerts = pgTable(
  "pace_alerts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    categoryId: bigint("category_id", { mode: "number" })
      .notNull()
      .references(() => categories.id),
    month: date("month", { mode: "string" }).notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true, mode: "date" }).notNull(),
    recoveredAt: timestamp("recovered_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_pace_alerts_category_id").on(t.categoryId)],
);

export const storeCategoryMappings = pgTable("store_category_mappings", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  categoryId: bigint("category_id", { mode: "number" })
    .notNull()
    .references(() => categories.id),
  storeName: varchar("store_name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const unclassifiedAlerts = pgTable("unclassified_alerts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  count: integer("count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    notifiableType: varchar("notifiable_type").notNull(),
    notifiableId: bigint("notifiable_id", { mode: "number" }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_notifications_notifiable").on(t.notifiableType, t.notifiableId),
    index("idx_notifications_read_at").on(t.readAt),
  ],
);

export const inboundEmails = pgTable("inbound_emails", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  messageId: varchar("message_id").notNull().unique(),
  from: varchar("from").notNull(),
  subject: varchar("subject"),
  rawBody: text("raw_body").notNull(),
  status: inboundEmailStatus("status").notNull(),
  errorMessage: text("error_message"),
  transactionId: bigint("transaction_id", { mode: "number" }).references(() => transactions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  categories,
  transactions,
  budgets,
  budgetAlertSettings,
  budgetAlerts,
  paceAlertSettings,
  paceAlerts,
  storeCategoryMappings,
  unclassifiedAlerts,
  notifications,
  inboundEmails,
};

export type Schema = typeof schema;

// postgres-js / pglite いずれの driver でも受け取れるよう HKT は any にする。
// PgDatabase は db instance と transaction の共通基底なので、Db 型引数の関数には
// db・tx どちらも渡せる（DbTransaction は Db に代入可能）。
export type Db = PgDatabase<any, Schema, ExtractTablesWithRelations<Schema>>;
export type DbTransaction = PgTransaction<any, Schema, ExtractTablesWithRelations<Schema>>;

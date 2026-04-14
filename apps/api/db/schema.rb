# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_14_015810) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "budget_alert_settings", force: :cascade do |t|
    t.bigint "category_id"
    t.datetime "created_at", null: false
    t.boolean "is_active", default: true, null: false
    t.integer "threshold", null: false
    t.integer "threshold_2"
    t.datetime "updated_at", null: false
    t.index ["category_id"], name: "index_budget_alert_settings_on_category_id"
  end

  create_table "budget_alerts", force: :cascade do |t|
    t.bigint "category_id", null: false
    t.datetime "created_at", null: false
    t.date "month", null: false
    t.integer "threshold", null: false
    t.datetime "updated_at", null: false
    t.integer "usage_percent", null: false
    t.index ["category_id", "month", "threshold"], name: "index_budget_alerts_on_category_id_and_month_and_threshold", unique: true
    t.index ["category_id"], name: "index_budget_alerts_on_category_id"
  end

  create_table "budgets", force: :cascade do |t|
    t.integer "amount", null: false
    t.bigint "category_id", null: false
    t.datetime "created_at", null: false
    t.date "month", null: false
    t.datetime "updated_at", null: false
    t.index ["category_id", "month"], name: "index_budgets_on_category_id_and_month", unique: true
    t.index ["category_id"], name: "index_budgets_on_category_id"
  end

  create_table "categories", force: :cascade do |t|
    t.string "color"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.integer "parent_id"
    t.integer "sort_order", default: 0, null: false
    t.integer "transactions_count", default: 0, null: false
    t.string "type", null: false
    t.datetime "updated_at", null: false
    t.index ["parent_id"], name: "index_categories_on_parent_id"
    t.index ["type"], name: "index_categories_on_type"
  end

  create_table "notifications", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "notifiable_id", null: false
    t.string "notifiable_type", null: false
    t.datetime "read_at"
    t.datetime "updated_at", null: false
    t.index ["notifiable_type", "notifiable_id"], name: "index_notifications_on_notifiable"
    t.index ["read_at"], name: "index_notifications_on_read_at"
  end

  create_table "pace_alert_settings", force: :cascade do |t|
    t.integer "active_from_day", default: 5, null: false
    t.bigint "category_id", null: false
    t.datetime "created_at", null: false
    t.boolean "is_active", default: true, null: false
    t.integer "threshold", null: false
    t.datetime "updated_at", null: false
    t.index ["category_id"], name: "index_pace_alert_settings_on_category_id"
  end

  create_table "pace_alerts", force: :cascade do |t|
    t.bigint "category_id", null: false
    t.datetime "created_at", null: false
    t.date "month", null: false
    t.datetime "recovered_at"
    t.datetime "triggered_at", null: false
    t.datetime "updated_at", null: false
    t.index ["category_id"], name: "index_pace_alerts_on_category_id"
  end

  create_table "store_category_mappings", force: :cascade do |t|
    t.bigint "category_id", null: false
    t.datetime "created_at", null: false
    t.string "store_name"
    t.datetime "updated_at", null: false
    t.index ["category_id"], name: "index_store_category_mappings_on_category_id"
  end

  create_table "transactions", force: :cascade do |t|
    t.integer "amount", null: false
    t.bigint "category_id"
    t.datetime "created_at", null: false
    t.string "memo"
    t.datetime "purchased_at", null: false
    t.string "source", null: false
    t.string "store_name", null: false
    t.datetime "updated_at", null: false
    t.index ["category_id"], name: "index_transactions_on_category_id"
    t.index ["purchased_at"], name: "index_transactions_on_purchased_at"
    t.index ["source"], name: "index_transactions_on_source"
  end

  create_table "unclassified_alerts", force: :cascade do |t|
    t.integer "count", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "budget_alert_settings", "categories"
  add_foreign_key "budget_alerts", "categories"
  add_foreign_key "budgets", "categories"
  add_foreign_key "pace_alert_settings", "categories"
  add_foreign_key "pace_alerts", "categories"
  add_foreign_key "store_category_mappings", "categories"
  add_foreign_key "transactions", "categories"
end

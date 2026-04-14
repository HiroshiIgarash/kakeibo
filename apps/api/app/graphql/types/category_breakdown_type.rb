# frozen_string_literal: true

module Types
  class CategoryBreakdownType < Types::BaseObject
    description "カテゴリ別支出内訳"

    field :category_id,      ID,      null: false, description: "カテゴリID"
    field :category_name,    String,  null: false, description: "カテゴリ名"
    field :amount,           Integer, null: false, description: "合計金額（円）"
    field :percentage,       Float,   null: false, description: "全体に占める割合（%）"
    field :pace_status,      Types::PaceStatusType, null: true,  description: "ペース状況（GREEN/YELLOW/RED）。当月のみ返す"
    field :budget_amount,    Integer, null: true,  description: "予算額（円）"
    field :remaining_amount, Integer, null: true,  description: "残り予算（円）"
    field :daily_amount,     Integer, null: true,  description: "1日あたり使用可能額（円）"
  end
end

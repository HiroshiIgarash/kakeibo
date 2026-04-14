# frozen_string_literal: true

module Types
  class BudgetAlertSettingType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,           ID,                  null: false, description: "予算アラート設定ID"
    field :threshold,    Integer,             null: false, description: "第1閾値（%）"
    field :threshold_2,  Integer,             null: true,  description: "第2閾値（%）"
    field :is_active,    Boolean,             null: false, description: "有効フラグ"
    field :category,     Types::CategoryType, null: true,  description: "カテゴリ（nil = 全体）"
    field :category_id,  ID,                  null: true,  description: "カテゴリID"
  end
end

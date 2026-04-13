# frozen_string_literal: true

module Types
  class BudgetAlertType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,            ID,                  null: false, description: "予算アラートID"
    field :usage_percent, Integer,             null: false, description: "使用率（%）"
    field :threshold,     Integer,             null: false, description: "アラート閾値（%）"
    field :category,      Types::CategoryType, null: false, description: "カテゴリ"
    field :category_id,   ID,                  null: false, description: "カテゴリID"
  end
end

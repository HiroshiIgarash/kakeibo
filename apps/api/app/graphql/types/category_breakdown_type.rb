# frozen_string_literal: true

module Types
  class CategoryBreakdownType < Types::BaseObject
    description "カテゴリ別支出内訳"

    field :category_id,   ID,      null: false, description: "カテゴリID"
    field :category_name, String,  null: false, description: "カテゴリ名"
    field :amount,        Integer, null: false, description: "合計金額（円）"
    field :percentage,    Float,   null: false, description: "全体に占める割合（%）"
  end
end

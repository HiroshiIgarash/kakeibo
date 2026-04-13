# frozen_string_literal: true

module Types
  class MonthlySummaryType < Types::BaseObject
    description "月次支出集計"

    field :total_amount,         Integer,                              null: false, description: "合計支出額（円）"
    field :budget_amount,        Integer,                              null: false, description: "合計予算額（円）"
    field :remaining_amount,     Integer,                              null: false, description: "残額（円）"
    field :category_breakdowns,  [ Types::CategoryBreakdownType ],    null: false, description: "カテゴリ別内訳"
  end
end

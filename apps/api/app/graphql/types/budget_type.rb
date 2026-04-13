# frozen_string_literal: true

module Types
  class BudgetType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,          ID,                  null: false, description: "予算ID"
    field :amount,      Integer,             null: false, description: "予算額"
    field :month,       Scalars::DateType,   null: false, description: "対象月"
    field :category,    Types::CategoryType, null: false, description: "カテゴリ"
    field :category_id, ID,                  null: false, description: "カテゴリID"
  end
end

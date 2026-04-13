# frozen_string_literal: true

module Types
  class CategoryType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id, ID, null: false, description: "カテゴリID"
    field :color, String,  description: "表示色"
    field :name, String, null: false, description: "カテゴリ名"
    field :parent_id, ID,  description: "親カテゴリID"
    field :parent, CategoryType,  description: "親カテゴリ"
    field :sort_order, Integer, null: false, description: "表示順"
    field :transactions_count, Integer, null: false, description: "紐づく取引件数"
    field :category_type, String, null: false, description: "カテゴリ種別（FixedCategory / VariableCategory）"

    def category_type
      object.type
    end
  end
end

# frozen_string_literal: true

module Types
  class StoreCategoryMappingType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,          ID,                  null: false, description: "マッピングID"
    field :store_name,  String,              null: false, description: "店舗名"
    field :category,    Types::CategoryType, null: false, description: "カテゴリ"
    field :category_id, ID,                  null: false, description: "カテゴリID"
  end
end

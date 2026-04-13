# frozen_string_literal: true

module Types
  class AlertSettingType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,          ID,                  null: false, description: "アラート設定ID"
    field :threshold,   Integer,             null: false, description: "アラート閾値（%）"
    field :is_active,   Boolean,             null: false, description: "有効フラグ"
    field :category,    Types::CategoryType, null: true,  description: "カテゴリ（nil = 全体）"
    field :category_id, ID,                  null: true,  description: "カテゴリID"
  end
end

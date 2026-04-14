# frozen_string_literal: true

module Types
  class PaceAlertSettingType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,             ID,                  null: false, description: "ペースアラート設定ID"
    field :threshold,      Integer,             null: false, description: "閾値（%、100超）"
    field :active_from_day, Integer,            null: false, description: "送信開始日（例: 5 = 5日以降）"
    field :is_active,      Boolean,             null: false, description: "有効フラグ"
    field :category,       Types::CategoryType, null: false, description: "カテゴリ"
    field :category_id,    ID,                  null: false, description: "カテゴリID"
  end
end

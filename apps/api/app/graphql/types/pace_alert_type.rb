# frozen_string_literal: true

module Types
  class PaceAlertType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,           ID,                                    null: false, description: "ペースアラートID"
    field :month,        GraphQL::Types::ISO8601Date,           null: false, description: "対象月"
    field :triggered_at, GraphQL::Types::ISO8601DateTime,       null: false, description: "発火日時"
    field :recovered_at, GraphQL::Types::ISO8601DateTime,       null: true,  description: "回復日時"
    field :category,     Types::CategoryType,                   null: false, description: "カテゴリ"
    field :category_id,  ID,                                    null: false, description: "カテゴリID"

    def category
      dataloader.with(Dataloaders::RecordById, Category).load(object.category_id)
    end
  end
end

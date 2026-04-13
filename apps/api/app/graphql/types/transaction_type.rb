# frozen_string_literal: true

module Types
  class TransactionType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,           ID,                           null: false, description: "取引ID"
    field :amount,       Integer,                      null: false, description: "金額"
    field :store_name,   String,                       null: false, description: "店舗名"
    field :memo,         String,                       null: true,  description: "メモ"
    field :purchased_at, Scalars::DateType,            null: false, description: "購入日"
    field :source,       Types::TransactionSourceType, null: false, description: "入力元"
    field :category,     Types::CategoryType,          null: true,  description: "カテゴリ"
    field :category_id,  ID,                           null: true,  description: "カテゴリID"

    def category
      dataloader.with(Dataloaders::RecordById, Category).load(object.category_id)
    end
  end
end

# frozen_string_literal: true

module Types
  module Inputs
    class TransactionInput < Types::BaseInputObject
      description "取引の作成・更新に使う入力値"

      argument :amount,       Integer,                      required: true,  description: "金額"
      argument :store_name,   String,                       required: true,  description: "店舗名"
      argument :purchased_at, Scalars::DateType,            required: true,  description: "購入日"
      argument :source,       Types::TransactionSourceType, required: true,  description: "入力元"
      argument :category_id,  ID,                           required: false, description: "カテゴリID"
      argument :memo,         String,                       required: false, description: "メモ"
    end
  end
end

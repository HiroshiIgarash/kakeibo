# frozen_string_literal: true

module Resolvers
  class TransactionsResolver < Resolvers::BaseResolver
    type [ Types::TransactionType ], null: false

    argument :year,        Integer, required: false, description: "絞り込む年"
    argument :month,       Integer, required: false, description: "絞り込む月"
    argument :category_id, ID,      required: false, description: "カテゴリIDで絞り込み"

    def resolve(year: nil, month: nil, category_id: nil)
      scope = Transaction.all
      scope = scope.by_month(year, month) if year && month
      scope = scope.where(category_id: category_id) if category_id
      scope.recent
    end
  end
end

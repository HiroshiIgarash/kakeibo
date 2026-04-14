# frozen_string_literal: true

module Mutations
  module Transactions
    class CreateTransaction < Mutations::BaseMutation
      description "Transactionを作成する"

      argument :category_id, ID,       required: false
      argument :amount,      Integer,  required: true
      argument :store_name,  String,   required: true
      argument :purchased_at, GraphQL::Types::ISO8601Date, required: true
      argument :source,      Types::TransactionSourceType, required: true

      field :transaction, Types::TransactionType, null: true
      field :errors,      [ String ],               null: false

      def resolve(category_id: nil, amount:, store_name:, purchased_at:, source:)
        transaction = Transaction.new(
          category_id:  category_id,
          amount:       amount,
          store_name:   store_name,
          purchased_at: purchased_at,
          source:       source
        )

        if transaction.save
          BudgetCheckService.call(
            category_id:  transaction.category_id,
            purchased_at: transaction.purchased_at
          )
          { transaction: transaction, errors: [] }
        else
          { transaction: nil, errors: transaction.errors.full_messages }
        end
      end
    end
  end
end

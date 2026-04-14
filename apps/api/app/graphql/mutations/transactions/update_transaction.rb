# frozen_string_literal: true

module Mutations
  module Transactions
    class UpdateTransaction < Mutations::BaseMutation
      description "Transactionを更新する"

      argument :id,           ID,       required: true
      argument :category_id,  ID,       required: false
      argument :amount,       Integer,  required: false
      argument :store_name,   String,   required: false
      argument :purchased_at, GraphQL::Types::ISO8601Date, required: false
      argument :source,       Types::TransactionSourceType, required: false

      field :transaction, Types::TransactionType, null: true
      field :errors,      [ String ],               null: false

      def resolve(id:, **attrs)
        transaction = Transaction.find_by(id: id)

        if transaction.nil?
          return { transaction: nil, errors: [ "IDが見つかりません: #{id}" ] }
        end

        if transaction.update(attrs.compact)
          if attrs[:category_id].present?
            BudgetAlertJob.perform_later(transaction.id)
            UnclassifiedAlertJob.perform_later
          end
          { transaction: transaction, errors: [] }
        else
          { transaction: nil, errors: transaction.errors.full_messages }
        end
      end
    end
  end
end

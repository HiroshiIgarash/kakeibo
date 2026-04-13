# frozen_string_literal: true

module Mutations
  module Transactions
    class DeleteTransaction < Mutations::BaseMutation
      description "Transactionを削除する"

      argument :id, ID, required: true

      field :success, Boolean, null: false
      field :errors,  [ String ], null: false

      def resolve(id:)
        transaction = Transaction.find_by(id: id)

        if transaction.nil?
          return { success: false, errors: [ "IDが見つかりません: #{id}" ] }
        end

        transaction.destroy
        { success: true, errors: [] }
      end
    end
  end
end

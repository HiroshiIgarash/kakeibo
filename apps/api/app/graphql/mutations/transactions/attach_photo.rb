# apps/api/app/graphql/mutations/transactions/attach_photo.rb

module Mutations
  module Transactions
    class AttachPhoto < BaseMutation
      description "Transactionに写真を添付する"

      argument :transaction_id, ID,              required: true
      argument :photo,          Types::UploadType, required: true

      field :transaction, Types::TransactionType, null: false

      def resolve(transaction_id:, photo:)
        transaction = ::Transaction.find_by(id: transaction_id)
        return { errors: [ "Transaction not found" ] } if transaction.nil?
        transaction.photo.attach(photo)
        { transaction: transaction }
      end
    end
  end
end

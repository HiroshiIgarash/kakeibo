# frozen_string_literal: true

module Types
  class MutationType < Types::BaseObject
    field :create_transaction,
      mutation: Mutations::Transactions::CreateTransaction
    field :update_transaction,
      mutation: Mutations::Transactions::UpdateTransaction
    field :delete_transaction,
      mutation: Mutations::Transactions::DeleteTransaction
  end
end

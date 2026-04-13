# frozen_string_literal: true

module Types
  class MutationType < Types::BaseObject
    field :create_transaction,
      mutation: Mutations::Transactions::CreateTransaction
    field :update_transaction,
      mutation: Mutations::Transactions::UpdateTransaction
    field :delete_transaction,
      mutation: Mutations::Transactions::DeleteTransaction
    field :create_category,
      mutation: Mutations::Categories::CreateCategory
    field :update_category,
      mutation: Mutations::Categories::UpdateCategory
    field :delete_category,
      mutation: Mutations::Categories::DeleteCategory

    field :upsert_budget,
      mutation: Mutations::Budgets::UpsertBudget
    field :delete_budget,
      mutation: Mutations::Budgets::DeleteBudget
  end
end

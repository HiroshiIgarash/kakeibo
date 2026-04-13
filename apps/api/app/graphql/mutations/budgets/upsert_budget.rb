# frozen_string_literal: true

module Mutations
  module Budgets
    class UpsertBudget < Mutations::BaseMutation
      description "Budgetを作成または更新する"

      argument :category_id, ID,               required: true
      argument :amount,      Integer,           required: true
      argument :month,       Scalars::DateType, required: true

      field :budget, Types::BudgetType, null: true
      field :errors, [ String ],        null: false

      def resolve(category_id:, amount:, month:)
        budget = Budget.find_or_initialize_by(category_id: category_id, month: month)
        budget.amount = amount

        if budget.save
          { budget: budget, errors: [] }
        else
          { budget: nil, errors: budget.errors.full_messages }
        end
      end
    end
  end
end

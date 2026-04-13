# frozen_string_literal: true

module Mutations
  module Budgets
    class DeleteBudget < Mutations::BaseMutation
      description "Budgetを削除する"

      argument :id, ID, required: true

      field :budget, Types::BudgetType, null: true
      field :errors, [ String ],        null: false

      def resolve(id:)
        budget = Budget.find_by(id: id)

        if budget.nil?
          return { budget: nil, errors: [ "IDが見つかりません: #{id}" ] }
        end

        budget.destroy
        { budget: budget, errors: [] }
      end
    end
  end
end

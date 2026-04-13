# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Budgets::DeleteBudget do
  let!(:budget) { create(:budget) }

  let(:query) do
    <<~GQL
      mutation DeleteBudget($input: DeleteBudgetInput!) {
        deleteBudget(input: $input) {
          budget {
            id
            amount
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "deleteBudget")
  end

  context "正常系：存在するIDの場合" do
    it "Budgetが削除される" do
      expect { execute({ id: budget.id }) }.to change(Budget, :count).by(-1)
    end

    it "削除したBudgetを返す" do
      result = execute({ id: budget.id })
      expect(result["budget"]["id"]).to eq(budget.id.to_s)
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    it "Budgetが削除されない" do
      expect { execute({ id: "0" }) }.not_to change(Budget, :count)
    end

    it "errorsを返す" do
      result = execute({ id: "0" })
      expect(result["budget"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

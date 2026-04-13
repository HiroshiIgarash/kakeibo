# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Budgets::UpsertBudget do
  let(:category) { create(:category) }

  let(:query) do
    <<~GQL
      mutation UpsertBudget($input: UpsertBudgetInput!) {
        upsertBudget(input: $input) {
          budget {
            id
            amount
            month
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "upsertBudget")
  end

  context "正常系：新規作成の場合" do
    let(:input) { { categoryId: category.id, amount: 30_000, month: "2024-01-01" } }

    it "Budgetが作成される" do
      expect { execute(input) }.to change(Budget, :count).by(1)
    end

    it "作成したBudgetを返す" do
      result = execute(input)
      expect(result["budget"]["amount"]).to eq(30_000)
      expect(result["errors"]).to be_empty
    end
  end

  context "正常系：同じ月・カテゴリで再実行した場合（更新）" do
    let!(:existing_budget) { create(:budget, category: category, month: "2024-01-01", amount: 20_000) }
    let(:input) { { categoryId: category.id, amount: 35_000, month: "2024-01-01" } }

    it "Budgetが増えない" do
      expect { execute(input) }.not_to change(Budget, :count)
    end

    it "amountが更新される" do
      result = execute(input)
      expect(result["budget"]["amount"]).to eq(35_000)
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：amountが0以下の場合" do
    let(:input) { { categoryId: category.id, amount: 0, month: "2024-01-01" } }

    it "Budgetが作成されない" do
      expect { execute(input) }.not_to change(Budget, :count)
    end

    it "errorsを返す" do
      result = execute(input)
      expect(result["budget"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

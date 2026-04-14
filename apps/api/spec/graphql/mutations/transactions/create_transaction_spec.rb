# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Transactions::CreateTransaction do
  let(:category) { create(:category) }

  let(:query) do
    <<~GQL
      mutation CreateTransaction($input: CreateTransactionInput!) {
        createTransaction(input: $input) {
          transaction {
            id
            amount
            storeName
            purchasedAt
            source
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "createTransaction")
  end

  context "正常系：有効なパラメータの場合" do
    let(:input) do
      {
        categoryId: category.id,
        amount: 1500,
        storeName: "コンビニ",
        purchasedAt: "2024-01-15",
        source: "MANUAL"
      }
    end

    it "Transactionが作成される" do
      expect { execute(input) }.to change(Transaction, :count).by(1)
    end

    it "作成したTransactionを返す" do
      result = execute(input)
      expect(result["transaction"]["amount"]).to eq(1500)
      expect(result["transaction"]["storeName"]).to eq("コンビニ")
      expect(result["errors"]).to be_empty
    end
  end

  context "正常系：category_idがnilの場合（未分類）" do
    let(:input) do
      {
        amount:      1500,
        storeName:   "不明な店",
        purchasedAt: "2024-01-15",
        source:      "SHORTCUT"
      }
    end

    it "Transactionが作成される" do
      expect { execute(input) }.to change(Transaction, :count).by(1)
    end

    it "UnclassifiedAlertJobをエンキューする" do
      expect { execute(input) }.to have_enqueued_job(UnclassifiedAlertJob)
    end
  end

  context "異常系：amountが不正な場合" do
    let(:input) do
      {
        amount: -100,
        storeName: "コンビニ",
        purchasedAt: "2024-01-15",
        source: "MANUAL"
      }
    end

    it "Transactionが作成されない" do
      expect { execute(input) }.not_to change(Transaction, :count)
    end

    it "errorsを返す" do
      result = execute(input)
      expect(result["transaction"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

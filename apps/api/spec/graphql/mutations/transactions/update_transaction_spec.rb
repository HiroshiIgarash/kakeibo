# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Transactions::UpdateTransaction do
  let!(:transaction) { create(:transaction) }

  let(:query) do
    <<~GQL
      mutation UpdateTransaction($input: UpdateTransactionInput!) {
        updateTransaction(input: $input) {
          transaction {
            id
            amount
            storeName
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "updateTransaction")
  end

  context "正常系：有効なパラメータの場合" do
    let(:input) do
      {
        id: transaction.id,
        amount: 2000,
        storeName: "スーパー更新"
      }
    end

    it "Transactionが更新される" do
      execute(input)
      expect(transaction.reload.amount).to eq(2000)
      expect(transaction.reload.store_name).to eq("スーパー更新")
    end

    it "更新したTransactionを返す" do
      result = execute(input)
      expect(result["transaction"]["amount"]).to eq(2000)
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    let(:input) { { id: "0", amount: 2000, storeName: "更新" } }

    it "errorsを返す" do
      result = execute(input)
      expect(result["transaction"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Transactions::DeleteTransaction do
  let!(:transaction) { create(:transaction) }

  let(:query) do
    <<~GQL
      mutation DeleteTransaction($input: DeleteTransactionInput!) {
        deleteTransaction(input: $input) {
          success
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "deleteTransaction")
  end

  context "正常系：存在するIDの場合" do
    it "Transactionが削除される" do
      expect { execute({ id: transaction.id }) }.to change(Transaction, :count).by(-1)
    end

    it "success: trueを返す" do
      result = execute({ id: transaction.id })
      expect(result["success"]).to be true
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    it "Transactionが削除されない" do
      expect { execute({ id: "0" }) }.not_to change(Transaction, :count)
    end

    it "errorsを返す" do
      result = execute({ id: "0" })
      expect(result["success"]).to be false
      expect(result["errors"]).not_to be_empty
    end
  end
end

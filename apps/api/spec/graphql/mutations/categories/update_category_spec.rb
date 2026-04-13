# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Categories::UpdateCategory do
  let(:category) { create(:category, name: "食費") }

  let(:query) do
    <<~GQL
      mutation UpdateCategory($input: UpdateCategoryInput!) {
        updateCategory(input: $input) {
          category {
            id
            name
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "updateCategory")
  end

  context "正常系：有効なパラメータの場合" do
    it "Categoryが更新される" do
      result = execute({ id: category.id, name: "外食費" })
      expect(result["category"]["name"]).to eq("外食費")
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：nameが空の場合" do
    it "errorsを返す" do
      result = execute({ id: category.id, name: "" })
      expect(result["category"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    it "errorsを返す" do
      result = execute({ id: "0", name: "外食費" })
      expect(result["category"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

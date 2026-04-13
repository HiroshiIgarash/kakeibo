# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Categories::CreateCategory do
  let(:query) do
    <<~GQL
      mutation CreateCategory($input: CreateCategoryInput!) {
        createCategory(input: $input) {
          category {
            id
            name
            categoryType
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "createCategory")
  end

  context "正常系：VariableCategoryを作成する場合" do
    let(:input) { { name: "食費", categoryType: "VariableCategory" } }

    it "Categoryが作成される" do
      expect { execute(input) }.to change(Category, :count).by(1)
    end

    it "作成したCategoryを返す" do
      result = execute(input)
      expect(result["category"]["name"]).to eq("食費")
      expect(result["category"]["categoryType"]).to eq("VariableCategory")
      expect(result["errors"]).to be_empty
    end
  end

  context "正常系：FixedCategoryを作成する場合" do
    let(:input) { { name: "家賃", categoryType: "FixedCategory" } }

    it "FixedCategoryが作成される" do
      result = execute(input)
      expect(result["category"]["categoryType"]).to eq("FixedCategory")
    end
  end

  context "異常系：nameが空の場合" do
    let(:input) { { name: "", categoryType: "VariableCategory" } }

    it "Categoryが作成されない" do
      expect { execute(input) }.not_to change(Category, :count)
    end

    it "errorsを返す" do
      result = execute(input)
      expect(result["category"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Categories::DeleteCategory do
  let!(:category) { create(:category) }

  let(:query) do
    <<~GQL
      mutation DeleteCategory($input: DeleteCategoryInput!) {
        deleteCategory(input: $input) {
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
      .dig("data", "deleteCategory")
  end

  context "正常系：存在するIDの場合" do
    it "Categoryが削除される" do
      expect { execute({ id: category.id }) }.to change(Category, :count).by(-1)
    end

    it "削除したCategoryを返す" do
      result = execute({ id: category.id })
      expect(result["category"]["id"]).to eq(category.id.to_s)
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    it "Categoryが削除されない" do
      expect { execute({ id: "0" }) }.not_to change(Category, :count)
    end

    it "errorsを返す" do
      result = execute({ id: "0" })
      expect(result["category"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

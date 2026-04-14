# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::StoreMappings::UpdateStoreMapping do
  let!(:category) { create(:category) }

  let(:query) do
    <<~GQL
      mutation UpdateStoreMapping($input: UpdateStoreMappingInput!) {
        updateStoreMapping(input: $input) {
          storeMapping {
            id
            storeName
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "updateStoreMapping")
  end

  context "正常系：新規店名の場合" do
    it "StoreCategoryMappingが作成される" do
      expect {
        execute({ storeName: "ローソン", categoryId: category.id })
      }.to change(StoreCategoryMapping, :count).by(1)
    end

    it "作成したStoreCategoryMappingを返す" do
      result = execute({ storeName: "ローソン", categoryId: category.id })
      expect(result["storeMapping"]["storeName"]).to eq("ローソン")
      expect(result["errors"]).to be_empty
    end
  end

  context "正常系：既存店名の場合" do
    let!(:mapping) { create(:store_category_mapping, store_name: "セブンイレブン", category: category) }
    let!(:other_category) { create(:category) }

    it "StoreCategoryMappingが増えない" do
      expect {
        execute({ storeName: "セブンイレブン", categoryId: other_category.id })
      }.not_to change(StoreCategoryMapping, :count)
    end

    it "カテゴリが更新される" do
      execute({ storeName: "セブンイレブン", categoryId: other_category.id })
      expect(mapping.reload.category_id).to eq(other_category.id)
    end
  end

  context "異常系：存在しないcategory_idの場合" do
    it "StoreCategoryMappingが作成されない" do
      expect {
        execute({ storeName: "ファミマ", categoryId: "0" })
      }.not_to change(StoreCategoryMapping, :count)
    end

    it "errorsを返す" do
      result = execute({ storeName: "ファミマ", categoryId: "0" })
      expect(result["storeMapping"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

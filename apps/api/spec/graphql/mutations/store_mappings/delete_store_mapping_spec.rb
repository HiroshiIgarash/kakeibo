# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::StoreMappings::DeleteStoreMapping do
  let!(:category) { create(:category) }
  let!(:mapping) { create(:store_category_mapping, store_name: "セブンイレブン", category: category) }

  let(:query) do
    <<~GQL
      mutation DeleteStoreMapping($input: DeleteStoreMappingInput!) {
        deleteStoreMapping(input: $input) {
          storeMapping {
            id
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "deleteStoreMapping")
  end

  context "正常系：存在するIDの場合" do
    it "StoreCategoryMappingが1件減る" do
      expect {
        execute({ id: mapping.id })
      }.to change(StoreCategoryMapping, :count).by(-1)
    end

    it "削除したStoreCategoryMappingのidを返す" do
      result = execute({ id: mapping.id })
      expect(result["storeMapping"]["id"]).to eq(mapping.id.to_s)
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    it "StoreCategoryMappingが削除されない" do
      expect {
        execute({ id: "0" })
      }.not_to change(StoreCategoryMapping, :count)
    end

    it "errorsを返す" do
      result = execute({ id: "0" })
      expect(result["storeMapping"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

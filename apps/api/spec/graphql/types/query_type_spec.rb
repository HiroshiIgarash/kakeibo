# frozen_string_literal: true

require "rails_helper"

RSpec.describe Types::QueryType do
  describe "categories" do
    let!(:parent) { create(:category) }
    let!(:child)  { create(:category, parent: parent) }

    let(:query) do
      <<~GQL
        query {
          categories {
            id
            name
          }
        }
      GQL
    end

    it "全カテゴリを返す" do
      result = ApiSchema.execute(query)
      ids = result["data"]["categories"].map { |c| c["id"] }
      expect(ids).to contain_exactly(parent.id.to_s, child.id.to_s)
    end
  end

  describe "category(id:)" do
    let!(:category) { create(:category) }

    let(:query) do
      <<~GQL
        query {
          category(id: "#{category.id}") {
            id
            name
          }
        }
      GQL
    end

    it "指定したIDのカテゴリを返す" do
      result = ApiSchema.execute(query)
      expect(result["data"]["category"]["id"]).to eq(category.id.to_s)
    end
  end

  describe "budgets" do
    let!(:budget) { create(:budget) }

    let(:query) do
      <<~GQL
        query {
          budgets {
            id
          }
        }
      GQL
    end

    it "全予算を返す" do
      result = ApiSchema.execute(query)
      ids = result["data"]["budgets"].map { |b| b["id"] }
      expect(ids).to contain_exactly(budget.id.to_s)
    end
  end
end

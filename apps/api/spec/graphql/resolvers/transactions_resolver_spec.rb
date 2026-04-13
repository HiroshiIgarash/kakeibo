# frozen_string_literal: true

require "rails_helper"

RSpec.describe Resolvers::TransactionsResolver do
  def execute_query(variables: {})
    query = <<~GQL
      query($year: Int, $month: Int, $categoryId: ID) {
        transactions(year: $year, month: $month, categoryId: $categoryId) {
          id
          amount
          storeName
          purchasedAt
        }
      }
    GQL
    ApiSchema.execute(query, variables: variables)
  end

  describe "引数なし" do
    let!(:t1) { create(:transaction, purchased_at: Date.new(2025, 4, 1)) }
    let!(:t2) { create(:transaction, purchased_at: Date.new(2025, 3, 1)) }

    it "全取引を返す" do
      result = execute_query
      ids = result["data"]["transactions"].map { |t| t["id"] }
      expect(ids).to contain_exactly(t1.id.to_s, t2.id.to_s)
    end
  end

  describe "year/month指定" do
    let!(:april) { create(:transaction, purchased_at: Date.new(2025, 4, 15)) }
    let!(:march) { create(:transaction, purchased_at: Date.new(2025, 3, 15)) }

    it "指定した月の取引だけ返す" do
      result = execute_query(variables: { year: 2025, month: 4 })
      ids = result["data"]["transactions"].map { |t| t["id"] }
      expect(ids).to contain_exactly(april.id.to_s)
    end
  end

  describe "category_id指定" do
    let!(:category) { create(:category) }
    let!(:matched)  { create(:transaction, category: category) }
    let!(:other)    { create(:transaction) }

    it "指定したカテゴリの取引だけ返す" do
      result = execute_query(variables: { categoryId: category.id.to_s })
      ids = result["data"]["transactions"].map { |t| t["id"] }
      expect(ids).to contain_exactly(matched.id.to_s)
    end
  end
end

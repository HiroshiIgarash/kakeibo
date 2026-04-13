# frozen_string_literal: true

require "rails_helper"

RSpec.describe Resolvers::TransactionsResolver do
  def execute_query(variables: {})
    query = <<~GQL
      query($year: Int, $month: Int, $categoryId: ID, $first: Int, $after: String) {
        transactions(year: $year, month: $month, categoryId: $categoryId, first: $first, after: $after) {
          nodes {
            id
            amount
            storeName
            purchasedAt
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          totalCount
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
      ids = result["data"]["transactions"]["nodes"].map { |t| t["id"] }
      expect(ids).to contain_exactly(t1.id.to_s, t2.id.to_s)
    end

    it "totalCountが正しい" do
      result = execute_query
      expect(result["data"]["transactions"]["totalCount"]).to eq(2)
    end
  end

  describe "year/month指定" do
    let!(:april) { create(:transaction, purchased_at: Date.new(2025, 4, 15)) }
    let!(:march) { create(:transaction, purchased_at: Date.new(2025, 3, 15)) }

    it "指定した月の取引だけ返す" do
      result = execute_query(variables: { year: 2025, month: 4 })
      ids = result["data"]["transactions"]["nodes"].map { |t| t["id"] }
      expect(ids).to contain_exactly(april.id.to_s)
    end
  end

  describe "category_id指定" do
    let!(:category) { create(:category) }
    let!(:matched)  { create(:transaction, category: category) }
    let!(:other)    { create(:transaction) }

    it "指定したカテゴリの取引だけ返す" do
      result = execute_query(variables: { categoryId: category.id.to_s })
      ids = result["data"]["transactions"]["nodes"].map { |t| t["id"] }
      expect(ids).to contain_exactly(matched.id.to_s)
    end
  end

  describe "Pagination（first/after）" do
    let!(:t1) { create(:transaction, purchased_at: Date.new(2025, 4, 3)) }
    let!(:t2) { create(:transaction, purchased_at: Date.new(2025, 4, 2)) }
    let!(:t3) { create(:transaction, purchased_at: Date.new(2025, 4, 1)) }

    it "first: 2 で最初の2件だけ返す" do
      result = execute_query(variables: { first: 2 })
      nodes = result["data"]["transactions"]["nodes"]
      expect(nodes.size).to eq(2)
    end

    it "hasNextPage が true になる" do
      result = execute_query(variables: { first: 2 })
      expect(result["data"]["transactions"]["pageInfo"]["hasNextPage"]).to be true
    end

    it "after カーソルで次のページが取得できる" do
      first_result = execute_query(variables: { first: 2 })
      cursor = first_result["data"]["transactions"]["pageInfo"]["endCursor"]

      second_result = execute_query(variables: { first: 2, after: cursor })
      nodes = second_result["data"]["transactions"]["nodes"]
      expect(nodes.size).to eq(1)
      expect(second_result["data"]["transactions"]["pageInfo"]["hasNextPage"]).to be false
    end
  end
end

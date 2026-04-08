require "rails_helper"

RSpec.describe Summarizable do
  let(:category) { create(:category) }

  describe "#total_amount" do
    it "カテゴリに紐づく支出の合計を返す" do
      create(:transaction, category: category, amount: 1000)
      create(:transaction, category: category, amount: 2000)
      expect(category.total_amount).to eq 3000
    end

    it "支出が0件のときは0を返す" do
      expect(category.total_amount).to eq 0
    end
  end
end

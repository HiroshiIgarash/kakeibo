require "rails_helper"

RSpec.describe Budget, type: :model do
  describe "アソシエーション" do
    it { should belong_to(:category) }
  end

  describe "バリデーション" do
    it { should validate_presence_of(:amount) }
    it { should validate_presence_of(:month) }
    it { should validate_numericality_of(:amount).is_greater_than(0) }
  end

  describe "ユニーク制約" do
    it "同じカテゴリ・同じ月の予算は2件登録できない" do
      category = create(:category)
      create(:budget, category: category, month: Date.today.beginning_of_month)
      duplicate = build(:budget, category: category, month: Date.today.beginning_of_month)
      expect(duplicate).not_to be_valid
    end
  end
end

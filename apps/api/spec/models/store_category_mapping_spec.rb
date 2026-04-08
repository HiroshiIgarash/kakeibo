require "rails_helper"

RSpec.describe StoreCategoryMapping, type: :model do
  describe "アソシエーション" do
    it { should belong_to(:category) }
  end

  describe "バリデーション" do
    it { should validate_presence_of(:store_name) }
  end

  describe "ユニーク制約" do
    it "同じ店名は2件登録できない" do
      create(:store_category_mapping, store_name: "セブンイレブン")
      duplicate = build(:store_category_mapping, store_name: "セブンイレブン")
      expect(duplicate).not_to be_valid
    end
  end
end

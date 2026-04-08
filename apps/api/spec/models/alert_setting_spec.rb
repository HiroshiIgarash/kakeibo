require "rails_helper"

RSpec.describe AlertSetting, type: :model do
  describe "アソシエーション" do
    it { should belong_to(:category).optional }
  end

  describe "バリデーション" do
    it { should validate_presence_of(:threshold) }
    it { should validate_numericality_of(:threshold).is_greater_than(0).is_less_than_or_equal_to(100) }
  end
end

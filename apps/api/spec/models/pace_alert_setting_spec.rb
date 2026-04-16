require "rails_helper"

RSpec.describe PaceAlertSetting, type: :model do
  describe "アソシエーション" do
    it { should belong_to(:category) }
  end

  describe "バリデーション" do
    it { should validate_presence_of(:threshold) }
    it { should validate_numericality_of(:threshold).is_greater_than(100).is_less_than_or_equal_to(500) }
    it { should validate_presence_of(:active_from_day) }
    it { should validate_numericality_of(:active_from_day).is_greater_than(0).is_less_than_or_equal_to(28) }
  end
end

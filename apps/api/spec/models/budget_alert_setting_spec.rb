require "rails_helper"

RSpec.describe BudgetAlertSetting, type: :model do
  describe "アソシエーション" do
    it { should belong_to(:category).optional }
  end

  describe "バリデーション" do
    it { should validate_presence_of(:threshold) }
    it { should validate_numericality_of(:threshold).is_greater_than(0).is_less_than_or_equal_to(200) }
    it { should validate_numericality_of(:threshold_2).is_greater_than(0).is_less_than_or_equal_to(200).allow_nil }

    context "threshold_2 が threshold 以下の場合" do
      subject { build(:budget_alert_setting, threshold: 80, threshold_2: 80) }

      it "バリデーションエラーになる" do
        expect(subject).not_to be_valid
        expect(subject.errors[:threshold_2]).to be_present
      end
    end

    context "threshold_2 が threshold より大きい場合" do
      subject { build(:budget_alert_setting, threshold: 80, threshold_2: 100) }

      it "バリデーションが通る" do
        expect(subject).to be_valid
      end
    end
  end
end

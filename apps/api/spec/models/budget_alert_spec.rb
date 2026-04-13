require 'rails_helper'

RSpec.describe BudgetAlert, type: :model do
  subject(:budget_alert) { build(:budget_alert) }

  describe "associations" do
    it { is_expected.to belong_to(:category) }
    it { is_expected.to have_one(:notification).dependent(:destroy) }
  end

  describe "validations" do
    it { is_expected.to validate_presence_of(:usage_percent) }
    it { is_expected.to validate_presence_of(:threshold) }
    it { is_expected.to validate_numericality_of(:usage_percent).is_greater_than(0).is_less_than_or_equal_to(100) }
    it { is_expected.to validate_numericality_of(:threshold).is_greater_than(0).is_less_than_or_equal_to(100) }
  end
end

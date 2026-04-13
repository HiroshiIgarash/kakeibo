require "rails_helper"

RSpec.describe UnclassifiedAlert, type: :model do
  subject(:unclassified_alert) { build(:unclassified_alert) }

  describe "associations" do
    it { is_expected.to have_one(:notification).dependent(:destroy) }
  end

  describe "validations" do
    it { is_expected.to validate_presence_of(:count) }
    it { is_expected.to validate_numericality_of(:count).is_greater_than(0).only_integer }
  end
end

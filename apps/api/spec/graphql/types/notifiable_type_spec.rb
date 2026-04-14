require "rails_helper"

RSpec.describe Types::NotifiableType do
  describe ".resolve_type" do
    subject { described_class.resolve_type(object, nil) }

    context "BudgetAlert の場合" do
      let(:object) { build(:budget_alert) }

      it { is_expected.to eq(Types::BudgetAlertType) }
    end

    context "PaceAlert の場合" do
      let(:object) { build(:pace_alert) }

      it { is_expected.to eq(Types::PaceAlertType) }
    end

    context "UnclassifiedAlert の場合" do
      let(:object) { build(:unclassified_alert) }

      it { is_expected.to eq(Types::UnclassifiedAlertType) }
    end
  end

  describe "possible_types" do
    it "BudgetAlertType、PaceAlertType、UnclassifiedAlertType を含む" do
      expect(described_class.possible_types).to include(
        Types::BudgetAlertType,
        Types::PaceAlertType,
        Types::UnclassifiedAlertType
      )
    end
  end
end

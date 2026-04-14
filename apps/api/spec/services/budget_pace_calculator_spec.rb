require "rails_helper"

RSpec.describe BudgetPaceCalculator do
  let(:category) { create(:category) }
  let!(:budget)  { create(:budget, category: category, amount: 30_000) }

  # 2025年1月10日（31日月）で固定
  # ideal_rate = 10/31 ≈ 0.3226
  # remaining_days = 22（1/10〜1/31、今日含む）
  around { |e| travel_to(Date.new(2025, 1, 10)) { e.run } }

  describe "#call" do
    subject(:result) { described_class.new(category: category).call }

    context "予算が存在しない場合" do
      let!(:budget) { nil }

      it { is_expected.to be_nil }
    end

    context "支出がペース以内（GREEN）" do
      # pace_rate = (8_000/30_000) / (10/31) ≈ 0.83 → GREEN
      before { create(:transaction, category: category, amount: 8_000, purchased_at: Date.new(2025, 1, 5)) }

      it { expect(result[:pace_status]).to eq("GREEN") }
      it { expect(result[:spent]).to eq(8_000) }
      it { expect(result[:budget_amount]).to eq(30_000) }
      it { expect(result[:remaining_amount]).to eq(22_000) }
      it { expect(result[:remaining_days]).to eq(22) }
      it { expect(result[:daily_amount]).to eq(1_000) } # 22_000 / 22
    end

    context "支出がペースをやや超過（YELLOW）" do
      # pace_rate = (10_000/30_000) / (10/31) ≈ 1.03 → YELLOW
      before { create(:transaction, category: category, amount: 10_000, purchased_at: Date.new(2025, 1, 5)) }

      it { expect(result[:pace_status]).to eq("YELLOW") }
    end

    context "支出が大幅にペース超過（RED）" do
      # pace_rate = (15_000/30_000) / (10/31) ≈ 1.55 → RED
      before { create(:transaction, category: category, amount: 15_000, purchased_at: Date.new(2025, 1, 5)) }

      it { expect(result[:pace_status]).to eq("RED") }
    end

    context "当月以外の取引は集計しない" do
      before do
        create(:transaction, category: category, amount: 5_000, purchased_at: Date.new(2024, 12, 31))
        create(:transaction, category: category, amount: 5_000, purchased_at: Date.new(2025, 1, 5))
      end

      it { expect(result[:spent]).to eq(5_000) }
    end
  end
end

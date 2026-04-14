# frozen_string_literal: true

require "rails_helper"

RSpec.describe Types::PaceStatusType do
  it "GREEN / YELLOW / RED の3値を持つ" do
    values = described_class.values.keys
    expect(values).to contain_exactly("GREEN", "YELLOW", "RED")
  end

  describe "monthlySummary経由でpace_statusが返る" do
    let(:category)     { create(:category) }
    let(:target_month) { Date.new(2024, 1, 1) }

    before do
      create(:budget, category: category, amount: 30_000, month: target_month)
      # 月の1日時点で少額の支出 → GREEN になる
      create(:transaction, category: category, amount: 100, purchased_at: target_month + 1.day)
    end

    let(:query) do
      <<~GQL
        query {
          monthlySummary(year: 2024, month: 1) {
            categoryBreakdowns {
              paceStatus
            }
          }
        }
      GQL
    end

    it "paceStatusがenum値（GREEN/YELLOW/RED）で返る" do
      travel_to(target_month + 1.day) do
        result = ApiSchema.execute(query)
        status = result["data"]["monthlySummary"]["categoryBreakdowns"].first["paceStatus"]
        expect(%w[GREEN YELLOW RED]).to include(status)
      end
    end
  end
end

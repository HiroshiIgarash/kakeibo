# frozen_string_literal: true

require "rails_helper"

RSpec.describe MonthlySummaryService do
  let(:category_food) { create(:category, name: "食費") }
  let(:category_daily) { create(:category, name: "日用品") }
  let(:year) { 2024 }
  let(:month) { 1 }
  let(:target_month) { Date.new(year, month, 1) }

  before do
    # 対象月の取引
    create(:transaction, category: category_food,  amount: 3000, purchased_at:
target_month + 1.day)
    create(:transaction, category: category_food,  amount: 2000, purchased_at:
target_month + 2.days)
    create(:transaction, category: category_daily, amount: 1000, purchased_at:
target_month + 3.days)

    # 対象月外の取引（集計に含まれてはいけない）
    create(:transaction, category: category_food, amount: 9999, purchased_at:
target_month - 1.day)

    # 予算
    create(:budget, category: category_food,  amount: 30_000, month: target_month)
    create(:budget, category: category_daily, amount: 10_000, month: target_month)
  end

  subject(:result) { described_class.new(year: year, month: month).call }

  describe "#call" do
    it "対象月の合計支出額を返す" do
      expect(result[:total_amount]).to eq 6000
    end

    it "対象月の合計予算額を返す" do
      expect(result[:budget_amount]).to eq 40_000
    end

    it "残額（予算 - 支出）を返す" do
      expect(result[:remaining_amount]).to eq 34_000
    end

    describe "カテゴリ別内訳" do
      let(:breakdowns) { result[:category_breakdowns] }

      it "カテゴリ数が正しい" do
        expect(breakdowns.size).to eq 2
      end

      it "食費の集計が正しい" do
        food = breakdowns.find { |b| b[:category_name] == "食費" }
        expect(food[:amount]).to eq 5000
        expect(food[:percentage]).to be_within(0.1).of(83.3)
      end

      it "日用品の集計が正しい" do
        daily = breakdowns.find { |b| b[:category_name] == "日用品" }
        expect(daily[:amount]).to eq 1000
        expect(daily[:percentage]).to be_within(0.1).of(16.7)
      end
    end
  end
end

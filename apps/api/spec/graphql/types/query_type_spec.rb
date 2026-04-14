# frozen_string_literal: true

require "rails_helper"

RSpec.describe Types::QueryType do
  describe "categories" do
    let!(:parent) { create(:category) }
    let!(:child)  { create(:category, parent: parent) }

    let(:query) do
      <<~GQL
        query {
          categories {
            id
            name
          }
        }
      GQL
    end

    it "全カテゴリを返す" do
      result = ApiSchema.execute(query)
      ids = result["data"]["categories"].map { |c| c["id"] }
      expect(ids).to contain_exactly(parent.id.to_s, child.id.to_s)
    end
  end

  describe "category(id:)" do
    let!(:category) { create(:category) }

    let(:query) do
      <<~GQL
        query {
          category(id: "#{category.id}") {
            id
            name
          }
        }
      GQL
    end

    it "指定したIDのカテゴリを返す" do
      result = ApiSchema.execute(query)
      expect(result["data"]["category"]["id"]).to eq(category.id.to_s)
    end
  end

  describe "budgets" do
    let!(:budget) { create(:budget) }

    let(:query) do
      <<~GQL
        query {
          budgets {
            id
          }
        }
      GQL
    end

    it "全予算を返す" do
      result = ApiSchema.execute(query)
      ids = result["data"]["budgets"].map { |b| b["id"] }
      expect(ids).to contain_exactly(budget.id.to_s)
    end
  end

  describe "monthlySummary(year:, month:)" do
    let(:category_food)  { create(:category, name: "食費") }
    let(:category_daily) { create(:category, name: "日用品") }
    let(:target_month)   { Date.new(2024, 1, 1) }

    before do
      create(:transaction, category: category_food,  amount: 5000, purchased_at: target_month + 1.day)
      create(:transaction, category: category_daily, amount: 1000, purchased_at: target_month + 2.days)
      create(:budget, category: category_food,  amount: 30_000, month: target_month)
      create(:budget, category: category_daily, amount: 10_000, month: target_month)
    end

    let(:query) do
      <<~GQL
        query {
          monthlySummary(year: 2024, month: 1) {
            totalAmount
            budgetAmount
            remainingAmount
            categoryBreakdowns {
              categoryId
              categoryName
              amount
              percentage
            }
          }
        }
      GQL
    end

    it "月次集計を返す" do
      result = ApiSchema.execute(query)
      summary = result["data"]["monthlySummary"]

      expect(summary["totalAmount"]).to eq 6000
      expect(summary["budgetAmount"]).to eq 40_000
      expect(summary["remainingAmount"]).to eq 34_000
      expect(summary["categoryBreakdowns"].size).to eq 2
    end
  end

  describe "alertSettings" do
    let!(:budget_alert_setting) { create(:budget_alert_setting) }
    let!(:pace_alert_setting)   { create(:pace_alert_setting) }

    let(:query) do
      <<~GQL
        query {
          alertSettings {
            budgetAlertSettings {
              id
              threshold
              isActive
            }
            paceAlertSettings {
              id
              threshold
              activeFromDay
              isActive
            }
          }
        }
      GQL
    end

    it "全アラート設定を返す" do
      result = ApiSchema.execute(query)
      data = result["data"]["alertSettings"]

      expect(data["budgetAlertSettings"].map { |s| s["id"] })
        .to contain_exactly(budget_alert_setting.id.to_s)
      expect(data["paceAlertSettings"].map { |s| s["id"] })
        .to contain_exactly(pace_alert_setting.id.to_s)
    end
  end

  describe "notifications" do
    let(:query) do
      <<~GQL
      query {
        notifications {
          nodes {
            id
            readAt
            notifiable {
              ... on BudgetAlert {
                usagePercent
                threshold
              }
              ... on UnclassifiedAlert {
                count
              }
            }
          }
        }
      }
    GQL
    end

    context "BudgetAlertの通知がある場合" do
      let!(:budget_alert)  { create(:budget_alert) }
      let!(:notification)  { create(:notification, notifiable: budget_alert) }

      it "BudgetAlertの内容を返す" do
        result = ApiSchema.execute(query)
        node = result["data"]["notifications"]["nodes"].first

        expect(node["id"]).to eq(notification.id.to_s)
        expect(node["notifiable"]["usagePercent"]).to eq(budget_alert.usage_percent)
        expect(node["notifiable"]["threshold"]).to eq(budget_alert.threshold)
      end
    end

    context "UnclassifiedAlertの通知がある場合" do
      let!(:unclassified_alert) { create(:unclassified_alert) }
      let!(:notification)       { create(:notification, notifiable: unclassified_alert) }

      it "UnclassifiedAlertの内容を返す" do
        result = ApiSchema.execute(query)
        node = result["data"]["notifications"]["nodes"].first

        expect(node["id"]).to eq(notification.id.to_s)
        expect(node["notifiable"]["count"]).to eq(unclassified_alert.count)
      end
    end
  end
end

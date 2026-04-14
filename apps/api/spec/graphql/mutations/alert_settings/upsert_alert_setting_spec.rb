# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::AlertSettings::UpsertAlertSetting do
  let(:category) { create(:category) }

  let(:query) do
    <<~GQL
      mutation UpsertAlertSetting($input: UpsertAlertSettingInput!) {
        upsertAlertSetting(input: $input) {
          budgetAlertSetting {
            id
            threshold
            threshold2
            isActive
            categoryId
          }
          paceAlertSetting {
            id
            threshold
            activeFromDay
            isActive
            categoryId
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "upsertAlertSetting")
  end

  describe "settingType: BUDGET" do
    context "正常系：新規作成の場合" do
      let(:input) do
        {
          settingType: "BUDGET",
          categoryId: category.id,
          threshold: 80,
          isActive: true
        }
      end

      it "BudgetAlertSettingが作成される" do
        expect { execute(input) }.to change(BudgetAlertSetting, :count).by(1)
      end

      it "作成したBudgetAlertSettingを返す" do
        result = execute(input)
        setting = result["budgetAlertSetting"]
        expect(setting["threshold"]).to eq(80)
        expect(setting["isActive"]).to eq(true)
        expect(setting["categoryId"]).to eq(category.id.to_s)
        expect(result["errors"]).to be_empty
      end
    end

    context "正常系：threshold_2あり" do
      let(:input) do
        {
          settingType: "BUDGET",
          categoryId: category.id,
          threshold: 80,
          threshold2: 100,
          isActive: true
        }
      end

      it "threshold2が設定される" do
        result = execute(input)
        expect(result["budgetAlertSetting"]["threshold2"]).to eq(100)
        expect(result["errors"]).to be_empty
      end
    end

    context "正常系：同じカテゴリで再実行した場合（更新）" do
      let!(:existing) { create(:budget_alert_setting, category: category, threshold: 70) }
      let(:input) do
        {
          settingType: "BUDGET",
          categoryId: category.id,
          threshold: 90,
          isActive: true
        }
      end

      it "BudgetAlertSettingが増えない" do
        expect { execute(input) }.not_to change(BudgetAlertSetting, :count)
      end

      it "thresholdが更新される" do
        result = execute(input)
        expect(result["budgetAlertSetting"]["threshold"]).to eq(90)
        expect(result["errors"]).to be_empty
      end
    end

    context "異常系：thresholdが0の場合" do
      let(:input) do
        {
          settingType: "BUDGET",
          categoryId: category.id,
          threshold: 0,
          isActive: true
        }
      end

      it "BudgetAlertSettingが作成されない" do
        expect { execute(input) }.not_to change(BudgetAlertSetting, :count)
      end

      it "errorsを返す" do
        result = execute(input)
        expect(result["budgetAlertSetting"]).to be_nil
        expect(result["errors"]).not_to be_empty
      end
    end
  end

  describe "settingType: PACE" do
    context "正常系：新規作成の場合" do
      let(:input) do
        {
          settingType: "PACE",
          categoryId: category.id,
          threshold: 110,
          activeFromDay: 5,
          isActive: true
        }
      end

      it "PaceAlertSettingが作成される" do
        expect { execute(input) }.to change(PaceAlertSetting, :count).by(1)
      end

      it "作成したPaceAlertSettingを返す" do
        result = execute(input)
        setting = result["paceAlertSetting"]
        expect(setting["threshold"]).to eq(110)
        expect(setting["activeFromDay"]).to eq(5)
        expect(setting["isActive"]).to eq(true)
        expect(setting["categoryId"]).to eq(category.id.to_s)
        expect(result["errors"]).to be_empty
      end
    end

    context "正常系：同じカテゴリで再実行した場合（更新）" do
      let!(:existing) { create(:pace_alert_setting, category: category, threshold: 110) }
      let(:input) do
        {
          settingType: "PACE",
          categoryId: category.id,
          threshold: 120,
          activeFromDay: 5,
          isActive: true
        }
      end

      it "PaceAlertSettingが増えない" do
        expect { execute(input) }.not_to change(PaceAlertSetting, :count)
      end

      it "thresholdが更新される" do
        result = execute(input)
        expect(result["paceAlertSetting"]["threshold"]).to eq(120)
        expect(result["errors"]).to be_empty
      end
    end

    context "異常系：thresholdが100以下の場合" do
      let(:input) do
        {
          settingType: "PACE",
          categoryId: category.id,
          threshold: 100,
          activeFromDay: 5,
          isActive: true
        }
      end

      it "PaceAlertSettingが作成されない" do
        expect { execute(input) }.not_to change(PaceAlertSetting, :count)
      end

      it "errorsを返す" do
        result = execute(input)
        expect(result["paceAlertSetting"]).to be_nil
        expect(result["errors"]).not_to be_empty
      end
    end
  end
end

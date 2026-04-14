require "rails_helper"

RSpec.describe BudgetAlertJob, type: :job do
  let(:category)      { create(:category) }
  let(:budget)        { create(:budget, category: category, amount: 10_000, month: Date.current.beginning_of_month) }
  let(:alert_setting) { create(:budget_alert_setting, category: category, threshold: 80, threshold_2: nil, is_active: true) }
  let(:transaction)   { create(:transaction, category: category, amount: 8_500, purchased_at: Date.current) }

  before { budget; alert_setting }

  describe "#perform" do
    context "Transactionが存在しない場合" do
      it "何もしない" do
        expect { described_class.perform_now(0) }.not_to change(BudgetAlert, :count)
      end
    end

    context "予算が設定されていない場合" do
      let(:transaction) { create(:transaction, category: category, amount: 9_000, purchased_at: Date.current) }

      before { budget.destroy }

      it "何もしない" do
        expect { described_class.perform_now(transaction.id) }.not_to change(BudgetAlert, :count)
      end
    end

    context "アラート設定が無効の場合" do
      before { alert_setting.update!(is_active: false) }

      it "何もしない" do
        expect { described_class.perform_now(transaction.id) }.not_to change(BudgetAlert, :count)
      end
    end

    context "使用率が閾値未満の場合" do
      let(:transaction) { create(:transaction, category: category, amount: 7_000, purchased_at: Date.current) }

      it "BudgetAlertを作成しない" do
        expect { described_class.perform_now(transaction.id) }.not_to change(BudgetAlert, :count)
      end
    end

    context "使用率が閾値を超えた場合" do
      it "BudgetAlertを1件作成する" do
        expect { described_class.perform_now(transaction.id) }.to change(BudgetAlert, :count).by(1)
      end

      it "メール送信ジョブをエンキューする" do
        expect { described_class.perform_now(transaction.id) }
          .to have_enqueued_mail(BudgetMailer, :budget_exceeded)
      end

      it "正しい閾値でBudgetAlertを作成する" do
        described_class.perform_now(transaction.id)
        alert = BudgetAlert.last
        expect(alert.threshold).to eq(80)
        expect(alert.category).to eq(category)
        expect(alert.month).to eq(Date.current.beginning_of_month)
      end
    end

    context "同じ閾値で既にアラートが送られている場合" do
      before do
        create(:budget_alert, category: category, month: Date.current.beginning_of_month, threshold: 80, usage_percent: 85)
      end

      it "重複してBudgetAlertを作成しない" do
        expect { described_class.perform_now(transaction.id) }.not_to change(BudgetAlert, :count)
      end
    end

    context "threshold_2 も設定されている場合" do
      before { alert_setting.update!(threshold_2: 100) }

      let(:transaction) { create(:transaction, category: category, amount: 10_500, purchased_at: Date.current) }

      it "BudgetAlertを2件作成する（threshold_1 と threshold_2 それぞれ）" do
        expect { described_class.perform_now(transaction.id) }.to change(BudgetAlert, :count).by(2)
      end
    end
  end
end

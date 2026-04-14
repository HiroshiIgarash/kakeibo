require "rails_helper"

RSpec.describe PaceAlertJob, type: :job do
  let(:category)      { create(:category) }
  let(:budget)        { create(:budget, category: category, amount: 30_000, month: Date.current.beginning_of_month) }
  let(:alert_setting) { create(:pace_alert_setting, category: category, threshold: 110, active_from_day: 5, is_active: true) }

  before { budget; alert_setting }

  describe "#perform" do
    context "active_from_day より前の日付の場合" do
      it "何もしない" do
        travel_to Date.current.beginning_of_month + 3.days do
          expect { described_class.perform_now }.not_to change(PaceAlert, :count)
        end
      end
    end

    context "予算が設定されていない場合" do
      before { budget.destroy }

      it "何もしない" do
        travel_to Date.current.beginning_of_month + 10.days do
          expect { described_class.perform_now }.not_to change(PaceAlert, :count)
        end
      end
    end

    context "ペースが閾値未満の場合" do
      it "PaceAlertを作成しない" do
        travel_to Date.current.beginning_of_month + 15.days do
          # 15日時点の理想消費率 = 50%、支出5,000円 = 実際16.7% → ペース率33% < 110%
          create(:transaction, category: category, amount: 5_000, purchased_at: Date.current)
          expect { described_class.perform_now }.not_to change(PaceAlert, :count)
        end
      end
    end

    context "ペースが閾値を超えた場合（初回）" do
      it "PaceAlertを作成してメールを送る" do
        travel_to Date.current.beginning_of_month + 10.days do
          # 10日時点の理想消費率 ≒ 33%、支出15,000円 = 実際50% → ペース率150% > 110%
          create(:transaction, category: category, amount: 15_000, purchased_at: Date.current)
          expect { described_class.perform_now }
            .to change(PaceAlert, :count).by(1)
            .and have_enqueued_mail(PaceMailer, :pace_exceeded)
        end
      end
    end

    context "既にREDの状態が続いている場合" do
      it "重複してPaceAlertを作成しない" do
        travel_to Date.current.beginning_of_month + 10.days do
          create(:pace_alert, category: category, month: Date.current.beginning_of_month, triggered_at: 1.day.ago, recovered_at: nil)
          create(:transaction, category: category, amount: 15_000, purchased_at: Date.current)
          expect { described_class.perform_now }.not_to change(PaceAlert, :count)
        end
      end
    end

    context "RED → 回復 → 再びREDになった場合" do
      it "新たにPaceAlertを作成する" do
        travel_to Date.current.beginning_of_month + 10.days do
          create(:pace_alert, category: category, month: Date.current.beginning_of_month, triggered_at: 2.days.ago, recovered_at: 1.day.ago)
          create(:transaction, category: category, amount: 15_000, purchased_at: Date.current)
          expect { described_class.perform_now }.to change(PaceAlert, :count).by(1)
        end
      end
    end

    context "ペースが回復した場合" do
      it "最新のPaceAlertにrecovered_atをセットする" do
        travel_to Date.current.beginning_of_month + 15.days do
          alert = create(:pace_alert, category: category, month: Date.current.beginning_of_month, triggered_at: 5.days.ago, recovered_at: nil)
          create(:transaction, category: category, amount: 3_000, purchased_at: Date.current)
          described_class.perform_now
          expect(alert.reload.recovered_at).not_to be_nil
        end
      end
    end
  end
end

require "rails_helper"

RSpec.describe UnclassifiedAlertJob, type: :job do
  describe "#perform" do
    context "未分類トランザクションが0件の場合" do
      context "UnclassifiedAlertが存在する場合" do
        let!(:alert) { create(:unclassified_alert) }

        it "UnclassifiedAlertを削除する" do
          expect { described_class.perform_now }.to change(UnclassifiedAlert, :count).by(-1)
        end
      end

      context "UnclassifiedAlertが存在しない場合" do
        it "何もしない" do
          expect { described_class.perform_now }.not_to change(UnclassifiedAlert, :count)
        end
      end
    end

    context "未分類トランザクションが存在する場合" do
      before { allow(ApiSchema.subscriptions).to receive(:trigger) }

      context "初回（UnclassifiedAlertが存在しない場合）" do
        let!(:unclassified_transaction) { create(:transaction, category: nil) }

        it "UnclassifiedAlertを1件作成する" do
          expect { described_class.perform_now }.to change(UnclassifiedAlert, :count).by(1)
        end

        it "Notificationを1件作成する" do
          expect { described_class.perform_now }.to change(Notification, :count).by(1)
        end

        it "未分類件数を正しくセットする" do
          described_class.perform_now
          expect(UnclassifiedAlert.first.count).to eq(1)
        end

        it "Subscriptionをトリガーする" do
          described_class.perform_now
          expect(ApiSchema.subscriptions).to have_received(:trigger)
            .with("notificationCreated", {}, kind_of(Notification))
        end
      end

      context "2回目以降（UnclassifiedAlertが既に存在する場合）" do
        let!(:alert)        { create(:unclassified_alert, count: 1) }
        let!(:notification) { create(:notification, notifiable: alert) }
        let!(:transaction1) { create(:transaction, category: nil) }
        let!(:transaction2) { create(:transaction, category: nil) }

        it "UnclassifiedAlertを追加作成しない" do
          expect { described_class.perform_now }.not_to change(UnclassifiedAlert, :count)
        end

        it "Notificationを追加作成しない" do
          expect { described_class.perform_now }.not_to change(Notification, :count)
        end

        it "countを現在の未分類件数に更新する" do
          described_class.perform_now
          expect(alert.reload.count).to eq(2)
        end

        it "Subscriptionをトリガーする" do
          described_class.perform_now
          expect(ApiSchema.subscriptions).to have_received(:trigger)
            .with("notificationCreated", {}, kind_of(Notification))
        end
      end
    end
  end
end

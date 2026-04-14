require "rails_helper"

RSpec.describe Subscriptions::NotificationCreated do
  describe "クラス設定" do
    it "payload_type が NotificationType である" do
      expect(described_class.payload_type).to eq(Types::NotificationType)
    end
  end

  describe "スキーマ統合" do
    it "SubscriptionType に notificationCreated フィールドが存在する" do
      field = Types::SubscriptionType.fields["notificationCreated"]
      expect(field).not_to be_nil
    end

    it "ApiSchema の SDL に Subscription が含まれる" do
      expect(ApiSchema.to_definition).to include("type Subscription")
    end
  end
end

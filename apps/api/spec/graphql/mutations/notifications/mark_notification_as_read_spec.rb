# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Notifications::MarkNotificationAsRead do
  let!(:notification) { create(:notification, read_at: nil) }

  let(:query) do
    <<~GQL
      mutation MarkNotificationAsRead($input: MarkNotificationAsReadInput!) {
        markNotificationAsRead(input: $input) {
          notification {
            id
            readAt
          }
          errors
        }
      }
    GQL
  end

  def execute(input)
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "markNotificationAsRead")
  end

  context "正常系：未読通知の場合" do
    it "read_atが設定される" do
      execute({ id: notification.id })
      expect(notification.reload.read_at).not_to be_nil
    end

    it "既読になった通知を返す" do
      result = execute({ id: notification.id })
      expect(result["notification"]["id"]).to eq(notification.id.to_s)
      expect(result["notification"]["readAt"]).not_to be_nil
      expect(result["errors"]).to be_empty
    end
  end

  context "異常系：存在しないIDの場合" do
    it "errorsを返す" do
      result = execute({ id: "0" })
      expect(result["notification"]).to be_nil
      expect(result["errors"]).not_to be_empty
    end
  end
end

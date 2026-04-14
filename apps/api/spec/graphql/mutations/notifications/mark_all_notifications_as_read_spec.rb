# frozen_string_literal: true

require "rails_helper"

RSpec.describe Mutations::Notifications::MarkAllNotificationsAsRead do
  let!(:unread1) { create(:notification, read_at: nil) }
  let!(:unread2) { create(:notification, read_at: nil) }
  let!(:read)    { create(:notification, read_at: 1.hour.ago) }

  let(:query) do
    <<~GQL
      mutation MarkAllNotificationsAsRead($input: MarkAllNotificationsAsReadInput!) {
        markAllNotificationsAsRead(input: $input) {
          count
          errors
        }
      }
    GQL
  end

  def execute(input = {})
    ApiSchema.execute(query, variables: { input: input })
      .dig("data", "markAllNotificationsAsRead")
  end

  context "正常系：未読通知がある場合" do
    it "未読通知がすべて既読になる" do
      execute
      expect(unread1.reload.read_at).not_to be_nil
      expect(unread2.reload.read_at).not_to be_nil
    end

    it "既読済みの通知は変更されない" do
      original_read_at = read.read_at
      execute
      expect(read.reload.read_at).to be_within(1.second).of(original_read_at)
    end

    it "更新件数を返す" do
      result = execute
      expect(result["count"]).to eq(2)
      expect(result["errors"]).to be_empty
    end
  end

  context "正常系：未読通知がない場合" do
    before { Notification.update_all(read_at: Time.current) }

    it "count 0を返す" do
      result = execute
      expect(result["count"]).to eq(0)
      expect(result["errors"]).to be_empty
    end
  end
end

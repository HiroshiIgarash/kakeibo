require "rails_helper"

RSpec.describe Notification, type: :model do
  subject(:notification) { build(:notification) }

  describe "associations" do
    it { is_expected.to belong_to(:notifiable).without_validating_presence }
  end

  describe "scopes" do
    let!(:unread) { create(:notification, read_at: nil) }
    let!(:read)   { create(:notification, read_at: Time.current) }

    it "unread returns only unread notifications" do
      expect(Notification.unread).to include(unread)
      expect(Notification.unread).not_to include(read)
    end
  end
end

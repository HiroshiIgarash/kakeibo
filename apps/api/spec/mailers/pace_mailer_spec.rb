require "rails_helper"

RSpec.describe PaceMailer, type: :mailer do
  describe "#pace_exceeded" do
    let(:category) { create(:category, name: "食費") }
    let(:budget)   { create(:budget, category: category, amount: 30_000) }
    let(:mail) do
      PaceMailer.pace_exceeded(
        category: category,
        budget: budget,
        spent: 20_000,
        pace_rate: 180.0
      )
    end

    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ALERT_EMAIL").and_return("test@example.com")
    end

    it "正しい宛先・送信元・件名でメールを送る" do
      expect(mail.to).to eq([ "test@example.com" ])
      expect(mail.from).to eq([ "noreply@kakeibo.example.com" ])
      expect(mail.subject).to eq("【ペース超過】食費の支出ペースが速すぎます")
    end

    it "メール本文にペース情報が含まれる" do
      expect(mail.text_part.decoded).to include("食費")
      expect(mail.text_part.decoded).to include("30,000")
      expect(mail.text_part.decoded).to include("20,000")
      expect(mail.text_part.decoded).to include("180.0")
    end
  end
end

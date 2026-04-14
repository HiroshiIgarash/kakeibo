require "rails_helper"

RSpec.describe BudgetMailer, type: :mailer do
  describe "#budget_exceeded" do
    let(:category) { create(:category, name: "食費") }
    let(:budget) { create(:budget, category: category, amount: 30_000) }
    let(:spent) { 35_000 }
    let(:mail) { BudgetMailer.budget_exceeded(budget: budget, spent: spent) }

    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ALERT_EMAIL").and_return("test@example.com")
    end

    it "正しい宛先・送信元・件名でメールを送る" do
      expect(mail.to).to eq([ "test@example.com" ])
      expect(mail.from).to eq([ "noreply@kakeibo.example.com" ])
      expect(mail.subject).to eq("【予算超過】食費の予算を超えました")
    end

    it "メール本文に予算情報が含まれる" do
      expect(mail.text_part.decoded).to include("食費")
      expect(mail.text_part.decoded).to include("30,000")
      expect(mail.text_part.decoded).to include("35,000")
    end
  end
end

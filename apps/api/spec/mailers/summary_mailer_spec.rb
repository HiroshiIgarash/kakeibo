require "rails_helper"

RSpec.describe SummaryMailer, type: :mailer do
  describe "#monthly_summary" do
    let(:target_month) { Date.new(2024, 3, 1) } # 2024年3月分
    let(:food_category) { create(:category, name: "食費") }
    let(:transport_category) { create(:category, name: "交通費") }

    before do
      # 前月（3月）の支出データ
      create(:transaction, category: food_category,
             amount: 15_000, purchased_at: target_month + 10.days)
      create(:transaction, category: food_category,
             amount: 10_000, purchased_at: target_month + 20.days)
      create(:transaction, category: transport_category,
             amount: 5_000, purchased_at: target_month + 5.days)

      # 直近3ヶ月の食費データ（推奨予算計算用）
      create(:transaction, category: food_category,
             amount: 24_000, purchased_at: target_month - 1.month)
      create(:transaction, category: food_category,
             amount: 27_000, purchased_at: target_month - 2.months)

      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ALERT_EMAIL").and_return("test@example.com")
    end

    let(:mail) { SummaryMailer.monthly_summary(target_month: target_month) }

    it "正しい宛先・送信元・件名でメールを送る" do
      expect(mail.to).to eq([ "test@example.com" ])
      expect(mail.from).to eq([ "noreply@kakeibo.example.com" ])
      expect(mail.subject).to eq("【月次レポート】2024年3月の家計まとめ")
    end

    it "メール本文に前月の総支出が含まれる" do
      # 15,000 + 10,000 + 5,000 = 30,000
      expect(mail.text_part.decoded).to include("30,000")
    end

    it "メール本文にカテゴリ別支出が含まれる" do
      expect(mail.text_part.decoded).to include("食費")
      expect(mail.text_part.decoded).to include("25,000") # 15,000 + 10,000
      expect(mail.text_part.decoded).to include("交通費")
      expect(mail.text_part.decoded).to include("5,000")
    end

    it "推奨予算は直近3ヶ月の実績平均を返す" do
      # 食費: 3月25,000 + 2月24,000 + 1月27,000 = 76,000 / 3 ≒ 25,333
      expect(mail.text_part.decoded).to include("25,333")
    end
  end
end

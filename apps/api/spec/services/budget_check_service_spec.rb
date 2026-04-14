require "rails_helper"

RSpec.describe BudgetCheckService do
  describe ".call" do
    let(:category) { create(:category) }
    let(:month)    { Date.new(2024, 1, 1) }
    let(:budget)   { create(:budget, category: category, amount: 30_000, month: month) }

    before do
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ALERT_EMAIL").and_return("test@example.com")
    end

    context "支出が予算を超えた場合" do
      before do
        create(:transaction, category: category, amount: 31_000, purchased_at: Date.new(2024, 1, 15))
        budget
      end

      it "メールを送信する" do
        expect(BudgetMailer).to receive(:budget_exceeded).with(
          budget: budget,
          spent:  31_000
        ).and_return(double(deliver_later: true))

        described_class.call(category_id: category.id, purchased_at: Date.new(2024, 1, 15))
      end
    end

    context "支出が予算以内の場合" do
      before do
        create(:transaction, category: category, amount: 10_000, purchased_at: Date.new(2024, 1, 15))
        budget
      end

      it "メールを送信しない" do
        expect(BudgetMailer).not_to receive(:budget_exceeded)

        described_class.call(category_id: category.id, purchased_at: Date.new(2024, 1, 15))
      end
    end

    context "Budgetが設定されていない場合" do
      it "何もしない" do
        expect(BudgetMailer).not_to receive(:budget_exceeded)

        described_class.call(category_id: category.id, purchased_at: Date.new(2024, 1, 15))
      end
    end
  end
end

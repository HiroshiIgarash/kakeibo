require 'rails_helper'

RSpec.describe Transaction, type: :model do
  describe "バリデーション" do
    it { should validate_presence_of(:amount) }
    it { should validate_presence_of(:store_name) }
    it { should validate_presence_of(:purchased_at) }
    it { should validate_presence_of(:source) }

    it "金額が正の整数のとき有効" do
      transaction = build(:transaction, amount: 500)
      expect(transaction).to be_valid
    end

    it "金額が0のとき無効" do
      transaction = build(:transaction, amount: 0)
      expect(transaction).to be_invalid
      expect(transaction.errors[:amount]).to include("は1以上の整数を入力してください")
    end
  end

  describe "enumerize :source" do
    it { should enumerize(:source).in(:shortcut, :manual).with_default(:shortcut) }
  end

  describe "scope" do
    let!(:this_month_tx) { create(:transaction, purchased_at: Time.current) }
    let!(:last_month_tx) { create(:transaction, purchased_at: 1.month.ago) }

    describe ".this_month" do
      it "今月の取引のみ返す" do
        expect(Transaction.this_month).to include(this_month_tx)
        expect(Transaction.this_month).not_to include(last_month_tx)
      end
    end

    describe ".recent" do
      it "purchased_atの降順で返す" do
        expect(Transaction.recent.first).to eq(this_month_tx)
      end
    end

    describe "アソシエーション" do
      it { should belong_to(:category).optional }
    end
  end
end

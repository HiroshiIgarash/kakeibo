require "rails_helper"

RSpec.describe PaceAlert, type: :model do
  describe "アソシエーション" do
    it { should belong_to(:category) }
    it { should have_one(:notification) }
  end

  describe "バリデーション" do
    it { should validate_presence_of(:month) }
    it { should validate_presence_of(:triggered_at) }
  end

  describe "#recovered?" do
    context "recovered_at が nil の場合" do
      subject { build(:pace_alert, recovered_at: nil) }

      it "false を返す" do
        expect(subject.recovered?).to be false
      end
    end

    context "recovered_at がある場合" do
      subject { build(:pace_alert, recovered_at: Time.current) }

      it "true を返す" do
        expect(subject.recovered?).to be true
      end
    end
  end
end

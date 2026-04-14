require 'rails_helper'

RSpec.describe Category, type: :model do
  describe 'バリデーション' do
    it { is_expected.to validate_presence_of(:name) }
    it { is_expected.to validate_presence_of(:type) }
  end

  describe '関連' do
    it { is_expected.to belong_to(:parent).class_name('Category').optional }
    it { is_expected.to have_many(:children).class_name('Category').with_foreign_key(:parent_id) }
    it { is_expected.to have_many(:transactions) }
  end

  describe 'スコープ' do
    it { expect(Category).to respond_to(:roots) }
    it { expect(Category).to respond_to(:variable) }
    it { expect(Category).to respond_to(:fixed) }
  end
end


require 'rails_helper'

RSpec.describe FixedCategory, type: :model do
  describe '種別' do
    it '固定費カテゴリとして初期化される' do
      category = FixedCategory.new
      expect(category.type).to eq('FixedCategory')
    end

    it 'Category.fixedスコープで取得できる' do
      category = FixedCategory.create!(name: '家賃')
      expect(Category.fixed).to include(category)
      expect(Category.variable).not_to include(category)
    end
  end
end

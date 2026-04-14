require 'rails_helper'

RSpec.describe VariableCategory, type: :model do
  describe '種別' do
    it '変動費カテゴリとして初期化される' do
      category = VariableCategory.new
      expect(category.type).to eq('VariableCategory')
    end

    it 'Category.variableスコープで取得できる' do
      category = VariableCategory.create!(name: '食費')
      expect(Category.variable).to include(category)
      expect(Category.fixed).not_to include(category)
    end
  end
end

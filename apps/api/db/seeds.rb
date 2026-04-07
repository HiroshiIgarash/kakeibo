  # This file should ensure the existence of records required to run the application in every environment (production,
  # development, test). The code here should be idempotent so that it can be executed at any point in every environment.
  # The data can then be loaded with the bin/rails db:seed command (or created alongside the database with db:setup).
  #
  # Example:
  #
  #   ["Action", "Comedy", "Drama", "Horror"].each do |genre_name|
  #     MovieGenre.find_or_create_by!(name: genre_name)
  #   end

  # 変動費カテゴリ（親）
  shokuhi    = VariableCategory.create!(name: '食費',          color:
  '#FF6B6B', sort_order: 1)
  nichiyohin = VariableCategory.create!(name: '日用品',        color:
  '#4ECDC4', sort_order: 2)
  kotsuhi    = VariableCategory.create!(name: '交通費',        color:
  '#45B7D1', sort_order: 3)
  goraku     = VariableCategory.create!(name: '娯楽',          color:
  '#96CEB4', sort_order: 4)
  sonota     = VariableCategory.create!(name: 'その他',        color:
  '#DDA0DD', sort_order: 5)

  # 固定費カテゴリ（親）
  yachin  = FixedCategory.create!(name: '家賃',   color: '#F7DC6F',
  sort_order: 6)
  sabusuku = FixedCategory.create!(name: 'サブスク', color: '#BB8FCE',
  sort_order: 7)

  # 食費の子カテゴリ
  VariableCategory.create!(name: '外食',        color: '#FF8E8E',
  sort_order: 1, parent: shokuhi)
  VariableCategory.create!(name: '自炊・スーパー', color: '#FFB347',
  sort_order: 2, parent: shokuhi)

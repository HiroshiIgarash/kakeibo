# 変動費カテゴリ（親）
shokuhi    = VariableCategory.find_or_create_by!(name: '食費')       { |c| c.color = '#FF6B6B'; c.sort_order = 1 }
nichiyohin = VariableCategory.find_or_create_by!(name: '日用品')     { |c| c.color = '#4ECDC4'; c.sort_order = 2 }
kotsuhi    = VariableCategory.find_or_create_by!(name: '交通費')     { |c| c.color = '#45B7D1'; c.sort_order = 3 }
goraku     = VariableCategory.find_or_create_by!(name: '娯楽')       { |c| c.color = '#96CEB4'; c.sort_order = 4 }
sonota     = VariableCategory.find_or_create_by!(name: 'その他')     { |c| c.color = '#DDA0DD'; c.sort_order = 5 }

# 固定費カテゴリ（親）
yachin   = FixedCategory.find_or_create_by!(name: '家賃')   { |c| c.color = '#F7DC6F'; c.sort_order = 6 }
sabusuku = FixedCategory.find_or_create_by!(name: 'サブスク') { |c| c.color = '#BB8FCE'; c.sort_order = 7 }

# 食費の子カテゴリ
gaishoku = VariableCategory.find_or_create_by!(name: '外食',        parent: shokuhi) { |c| c.color = '#FF8E8E'; c.sort_order = 1 }
jisui    = VariableCategory.find_or_create_by!(name: '自炊・スーパー', parent: shokuhi) { |c| c.color = '#FFB347'; c.sort_order = 2 }

# 開発用ダミーデータ（予算）
today = Date.today
this_month = today.beginning_of_month

Budget.find_or_create_by!(category: shokuhi,    month: this_month) { |b| b.amount = 40_000 }
Budget.find_or_create_by!(category: nichiyohin, month: this_month) { |b| b.amount = 10_000 }
Budget.find_or_create_by!(category: kotsuhi,    month: this_month) { |b| b.amount = 15_000 }
Budget.find_or_create_by!(category: goraku,     month: this_month) { |b| b.amount = 20_000 }
Budget.find_or_create_by!(category: yachin,     month: this_month) { |b| b.amount = 80_000 }
Budget.find_or_create_by!(category: sabusuku,   month: this_month) { |b| b.amount = 5_000 }

# 開発用ダミーデータ（取引）
if Transaction.count == 0
  [
    { amount: 1_200, store_name: 'マクドナルド',     category: gaishoku, purchased_at: today - 0 },
    { amount: 3_500, store_name: 'イオン',           category: jisui,    purchased_at: today - 1 },
    { amount: 980,   store_name: 'Suica',            category: kotsuhi,  purchased_at: today - 1 },
    { amount: 2_800, store_name: 'ユニクロ',         category: nichiyohin, purchased_at: today - 2 },
    { amount: 1_500, store_name: 'スターバックス',   category: gaishoku, purchased_at: today - 3 },
    { amount: 4_200, store_name: 'Netflix',          category: sabusuku, purchased_at: today - 5 },
    { amount: 75_000, store_name: '家賃引き落とし',  category: yachin,   purchased_at: today - 7 },
    { amount: 890,   store_name: 'コンビニ',         category: gaishoku, purchased_at: today - 8 },
    { amount: 6_800, store_name: '焼肉きんぐ',       category: gaishoku, purchased_at: today - 10 },
    { amount: 1_100, store_name: '未登録',           category: nil,      purchased_at: today - 0 } # 未分類
  ].each do |attrs|
    Transaction.create!(
      amount:       attrs[:amount],
      store_name:   attrs[:store_name],
      category:     attrs[:category],
      purchased_at: attrs[:purchased_at].to_datetime,
      source:       :manual
    )
  end
end

# 開発用ダミーデータ（通知）
if Notification.count == 0
  # 食費の予算が85%に達した（BudgetAlert）
  budget_alert = BudgetAlert.find_or_create_by!(
    category: shokuhi,
    month:     this_month,
    threshold: 80
  ) { |a| a.usage_percent = 85 }
  Notification.find_or_create_by!(notifiable: budget_alert)

  # 娯楽のペースが想定超過（PaceAlert）
  pace_alert = PaceAlert.find_or_create_by!(
    category: goraku,
    month:     this_month
  ) { |a| a.triggered_at = Time.current }
  Notification.find_or_create_by!(notifiable: pace_alert)

  # 未分類の支出が2件（UnclassifiedAlert）
  unclassified_alert = UnclassifiedAlert.find_or_create_by!(count: 2)
  Notification.find_or_create_by!(notifiable: unclassified_alert)
end

puts "Seeds完了: カテゴリ #{Category.count}件 / 予算 #{Budget.count}件 / 取引 #{Transaction.count}件 / 通知 #{Notification.count}件"

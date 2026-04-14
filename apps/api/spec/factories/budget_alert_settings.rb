FactoryBot.define do
  factory :budget_alert_setting do
    association :category
    threshold   { 80 }
    threshold_2 { nil }
    is_active   { true }
  end
end

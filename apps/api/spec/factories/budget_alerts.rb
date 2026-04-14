FactoryBot.define do
  factory :budget_alert do
    association :category, factory: :category
    month         { Date.current.beginning_of_month }
    usage_percent { 80 }
    threshold     { 80 }
  end
end

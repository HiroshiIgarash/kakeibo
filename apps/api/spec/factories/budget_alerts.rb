FactoryBot.define do
  factory :budget_alert do
    association :category, factory: :category
    usage_percent { 80 }
    threshold     { 80 }
  end
end

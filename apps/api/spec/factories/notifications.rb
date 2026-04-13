FactoryBot.define do
  factory :notification do
    association :notifiable, factory: :budget_alert
    read_at { nil }
  end
end

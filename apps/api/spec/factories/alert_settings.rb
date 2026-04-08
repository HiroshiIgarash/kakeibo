FactoryBot.define do
  factory :alert_setting do
    association :category
    threshold { 80 }
    is_active { true }
  end
end

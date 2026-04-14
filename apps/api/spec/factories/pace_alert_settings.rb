FactoryBot.define do
  factory :pace_alert_setting do
    association :category
    threshold       { 110 }
    active_from_day { 5 }
    is_active       { true }
  end
end

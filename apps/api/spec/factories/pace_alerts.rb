FactoryBot.define do
  factory :pace_alert do
    association :category
    month        { Date.current.beginning_of_month }
    triggered_at { Time.current }
    recovered_at { nil }
  end
end

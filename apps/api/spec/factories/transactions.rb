FactoryBot.define do
  factory :transaction do
    association :category
    amount { 1000 }
    store_name { "スーパー" }
    purchased_at { Time.current }
    source { :shortcut }
  end
end

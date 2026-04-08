FactoryBot.define do
  factory :transaction do
    amount { 1000 }
    store_name { "スーパー" }
    purchased_at { Time.current }
    source { :shortcut }
  end
end

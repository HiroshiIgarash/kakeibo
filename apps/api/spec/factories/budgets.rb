FactoryBot.define do
  factory :budget do
    association :category
    amount { 30_000 }
    month { Date.today.beginning_of_month }
  end
end

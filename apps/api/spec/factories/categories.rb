FactoryBot.define do
  factory :category do
    name { "食費" }
    type { "VariableCategory" }
    parent { nil }
  end
end

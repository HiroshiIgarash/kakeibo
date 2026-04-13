FactoryBot.define do
  factory :category, class: "VariableCategory" do
    name { "食費" }
    parent { nil }
  end
end

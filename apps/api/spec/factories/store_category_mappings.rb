FactoryBot.define do
  factory :store_category_mapping do
    association :category
    store_name { "セブンイレブン" }
  end
end

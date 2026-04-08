class StoreCategoryMapping < ApplicationRecord
  belongs_to :category

  validates :store_name, presence: true, uniqueness: true
end

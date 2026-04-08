class Budget < ApplicationRecord
  belongs_to :category

  validates :amount, presence: true, numericality: { greater_than: 0 }
  validates :month, presence: true
  validates :category_id, uniqueness: { scope: :month }
end

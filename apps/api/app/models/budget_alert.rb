class BudgetAlert < ApplicationRecord
  belongs_to :category
  has_one :notification, as: :notifiable, dependent: :destroy

  validates :usage_percent, presence: true,
                            numericality: { greater_than: 0, less_than_or_equal_to: 100 }
  validates :threshold, presence: true,
                            numericality: { greater_than: 0, less_than_or_equal_to: 100 }
end

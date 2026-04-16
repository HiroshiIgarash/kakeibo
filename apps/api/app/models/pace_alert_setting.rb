class PaceAlertSetting < ApplicationRecord
  belongs_to :category

  validates :threshold, presence: true, numericality: { greater_than: 100, less_than_or_equal_to: 500 }
  validates :active_from_day, presence: true, numericality: { greater_than: 0, less_than_or_equal_to: 28 }

  scope :active, -> { where(is_active: true) }
end

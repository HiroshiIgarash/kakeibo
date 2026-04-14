class PaceAlertSetting < ApplicationRecord
  belongs_to :category

  validates :threshold, presence: true, numericality: { greater_than: 100 }
  validates :active_from_day, presence: true, numericality: { greater_than: 0, less_than_or_equal_to: 28 }
end

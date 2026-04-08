class AlertSetting < ApplicationRecord
  belongs_to :category, optional: true

  validates :threshold, presence: true, numericality: { greater_than: 0, less_than_or_equal_to: 100 }
end

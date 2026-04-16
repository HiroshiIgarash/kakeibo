class BudgetAlertSetting < ApplicationRecord
  belongs_to :category, optional: true

  validates :threshold, presence: true, numericality: { greater_than: 0, less_than_or_equal_to: 200 }
  validates :threshold_2, numericality: { greater_than: 0, less_than_or_equal_to: 200 }, allow_nil: true
  validate :threshold_2_greater_than_threshold_1, if: -> { threshold_2.present? }

  private

  def threshold_2_greater_than_threshold_1
    return unless threshold.present? && threshold_2.present?

    errors.add(:threshold_2, "は第1閾値より大きい値にしてください") if threshold_2 <= threshold
  end
end

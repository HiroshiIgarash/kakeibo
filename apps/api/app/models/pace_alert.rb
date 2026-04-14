class PaceAlert < ApplicationRecord
  belongs_to :category
  has_one :notification, as: :notifiable, dependent: :destroy

  validates :month, presence: true
  validates :triggered_at, presence: true

  def recovered?
    recovered_at.present?
  end
end

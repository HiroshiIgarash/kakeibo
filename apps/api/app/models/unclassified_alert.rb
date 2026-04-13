class UnclassifiedAlert < ApplicationRecord
  has_one :notification, as: :notifiable, dependent: :destroy

  validates :count, presence: true,
                    numericality: { greater_than: 0, only_integer: true }
end

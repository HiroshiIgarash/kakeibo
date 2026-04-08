class Transaction < ApplicationRecord
  extend Enumerize

  belongs_to :category, optional: true

  enumerize :source, in: %i[shortcut manual], default: :shortcut

  validates :amount,       presence: true
  validates :store_name,   presence: true
  validates :purchased_at, presence: true
  validates :source,       presence: true

  validate :amount_must_be_positive_integer

  scope :by_month, ->(year, month) {
    where(purchased_at: Date.new(year, month).beginning_of_month..Date.new(year, month).end_of_month)
  }
  scope :this_month, -> { by_month(Date.today.year, Date.today.month) }
  scope :recent, -> { order(purchased_at: :desc) }
  private

    def amount_must_be_positive_integer
      return if amount.blank?
      unless amount == amount.to_i && amount.positive?
        errors.add(:amount, "は1以上の整数を入力してください")
      end
    end
end

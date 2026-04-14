class Category < ApplicationRecord
  include Summarizable

  belongs_to :parent, class_name: "Category", optional: true
  has_many :children, class_name: "Category", foreign_key: :parent_id, dependent: :destroy
  has_many :transactions
  has_many :budgets
  has_many :budget_alert_settings
  has_many :pace_alert_settings
  has_many :pace_alerts
  has_many :store_category_mappings

  validates :name, presence: true
  validates :type, presence: true

  scope :roots, -> { where(parent_id: nil) }
  scope :variable, -> { where(type: "VariableCategory") }
  scope :fixed, -> { where(type: "FixedCategory") }
end

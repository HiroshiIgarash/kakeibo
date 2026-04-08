module Summarizable
  extend ActiveSupport::Concern

  def total_amount
    transactions.sum(:amount)
  end
end

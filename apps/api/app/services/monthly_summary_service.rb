# frozen_string_literal: true

class MonthlySummaryService
  def initialize(year:, month:)
    @year = year
    @month = month
    @period = Date.new(year, month, 1).all_month
  end

  def call
    {
      total_amount:        total_amount,
      budget_amount:       budget_amount,
      remaining_amount:    budget_amount - total_amount,
      category_breakdowns: category_breakdowns
    }
  end

  private

    def transactions
      @transactions ||= Transaction.where(purchased_at: @period)
    end

    def total_amount
      @total_amount ||= transactions.sum(:amount)
    end

    def budget_amount
      @budget_amount ||= Budget.where(month: @period.first).sum(:amount)
    end

    def category_breakdowns
      transactions
        .joins(:category)
        .group("categories.id", "categories.name")
        .sum(:amount)
        .map do |(category_id, category_name), amount|
          {
            category_id:   category_id,
            category_name: category_name,
            amount:        amount,
            percentage:    total_amount.zero? ? 0.0 : (amount.to_f / total_amount *
  100).round(1)
          }
        end
    end
end

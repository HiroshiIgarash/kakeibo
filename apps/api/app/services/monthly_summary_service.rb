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

    def pace_date
      # 過去月はペース計算が無意味なため nil を返す
      @period.cover?(Date.current) ? Date.current : nil
    end

    def categories_by_id
      @categories_by_id ||= Category.where(id: spending_by_category.keys.map(&:first)).index_by(&:id)
    end

    def spending_by_category
      @spending_by_category ||= transactions
        .joins(:category)
        .group("categories.id", "categories.name")
        .sum(:amount)
    end

    def category_breakdowns
      spending_by_category.map do |(category_id, category_name), amount|
        category = categories_by_id[category_id]
        pace = pace_date && category ? BudgetPaceCalculator.new(category: category, date: pace_date).call : nil

        {
          category_id:      category_id,
          category_name:    category_name,
          amount:           amount,
          percentage:       total_amount.zero? ? 0.0 : (amount.to_f / total_amount * 100).round(1),
          pace_status:      pace&.dig(:pace_status),
          budget_amount:    pace&.dig(:budget_amount),
          remaining_amount: pace&.dig(:remaining_amount),
          daily_amount:     pace&.dig(:daily_amount)
        }
      end
    end
end

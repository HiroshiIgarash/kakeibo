class BudgetPaceCalculator
  GREEN_THRESHOLD  = 1.0
  YELLOW_THRESHOLD = 1.2

  def initialize(category:, date: Date.current)
    @category = category
    @date = date
    @month = date.beginning_of_month
  end

  def call
    return nil unless budget

    {
      pace_rate:        pace_rate,
      pace_status:      pace_status,
      spent:            spent,
      budget_amount:    budget.amount,
      remaining_amount: remaining_amount,
      remaining_days:   remaining_days,
      daily_amount:     daily_amount
    }
  end

  private

    def budget
      @budget ||= Budget.find_by(category: @category, month: @month)
    end

    def spent
      @spent ||= Transaction
        .where(category: @category)
        .where(purchased_at: @month..@date.end_of_day)
        .sum(:amount)
    end

    def days_in_month
      @date.end_of_month.day
    end

    def days_elapsed
      @date.day
    end

    def remaining_days
      days_in_month - days_elapsed + 1
    end

    def ideal_rate
      days_elapsed.to_f / days_in_month
    end

    def actual_rate
      spent.to_f / budget.amount
    end

    def pace_rate
      return 0.0 if ideal_rate.zero?

      actual_rate / ideal_rate
    end

    def pace_status
      return "RED" if actual_rate >= 1.0
      return "RED" if pace_rate >= YELLOW_THRESHOLD
      return "YELLOW" if pace_rate >= GREEN_THRESHOLD

      "GREEN"
    end

    def remaining_amount
      budget.amount - spent
    end

    def daily_amount
      return 0 if remaining_days <= 0

      remaining_amount / remaining_days
    end
end

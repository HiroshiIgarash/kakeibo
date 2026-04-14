class BudgetCheckService
  def self.call(category_id:, purchased_at:)
    month = purchased_at.beginning_of_month
    budget = Budget.find_by(category_id: category_id, month: month)
    return unless budget

    spent = Transaction
      .where(category_id: category_id)
      .where(purchased_at: month..purchased_at.end_of_month)
      .sum(:amount)

    return unless spent > budget.amount

    BudgetMailer.budget_exceeded(budget: budget, spent: spent).deliver_later
  end
end

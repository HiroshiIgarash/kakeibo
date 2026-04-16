class BudgetMailer < ApplicationMailer
  def budget_exceeded(budget:, spent:)
    @budget = budget
    @spent = spent
    @category_name = budget.category.name

    mail(
      to: ENV["ALERT_EMAIL"],
      subject: "【予算超過】#{@category_name}の予算を超えました"
    )
  end
end

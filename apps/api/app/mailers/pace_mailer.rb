class PaceMailer < ApplicationMailer
  def pace_exceeded(category:, budget:, spent:, pace_rate:)
    @category_name = category.name
    @budget_amount = budget.amount
    @spent = spent
    @pace_rate = pace_rate.round(1)

    mail(
      to: ENV["ALERT_EMAIL"],
      subject: "【ペース超過】#{@category_name}の支出ペースが速すぎます"
    )
  end
end

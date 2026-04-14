class BudgetAlertJob < ApplicationJob
  queue_as :default

  def perform(transaction_id)
    transaction = Transaction.find_by(id: transaction_id)
    return unless transaction

    category = transaction.category
    return unless category

    month = transaction.purchased_at.beginning_of_month
    budget = Budget.find_by(category: category, month: month)
    return unless budget

    alert_setting = category.budget_alert_setting
    return unless alert_setting&.is_active?
    spent = Transaction.where(category: category)
                       .where(purchased_at: month..month.end_of_month)
                       .sum(:amount)

    usage_rate = (spent.to_f / budget.amount * 100).round(1)

    [ alert_setting.threshold, alert_setting.threshold_2 ].compact.each do |threshold|
      next if usage_rate < threshold

      already_sent = BudgetAlert.exists?(
        category: category,
        month: month,
        threshold: threshold
      )
      next if already_sent

      alert = BudgetAlert.create!(
        category: category,
        month: month,
        threshold: threshold,
        usage_percent: usage_rate
      )
      notification = alert.create_notification!
      ApiSchema.subscriptions.trigger("notificationCreated", {}, notification)
      BudgetMailer.budget_exceeded(budget: budget, spent: spent).deliver_later
    end
  end
end

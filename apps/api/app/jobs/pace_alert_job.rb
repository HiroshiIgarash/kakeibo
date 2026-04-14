class PaceAlertJob < ApplicationJob
  queue_as :default

  def perform
    today = Date.current
    month = today.beginning_of_month
    days_in_month = today.end_of_month.day
    days_elapsed = today.day

    ideal_rate = days_elapsed.to_f / days_in_month * 100

    PaceAlertSetting.active.each do |setting|
      next if setting.active_from_day > days_elapsed

      category = setting.category
      budget = Budget.find_by(category: category, month: month)
      next unless budget

      spent = Transaction.where(category: category)
                         .where(purchased_at: month..today.end_of_day)
                         .sum(:amount)

      actual_rate = spent.to_f / budget.amount * 100
      pace_rate = actual_rate / ideal_rate * 100

      last_alert = PaceAlert.where(category: category, month: month)
                            .order(triggered_at: :desc)
                            .first

      if pace_rate >= setting.threshold
        next if last_alert&.recovered_at.nil? && last_alert.present?

        alert = PaceAlert.create!(
          category: category,
          month: month,
          triggered_at: Time.current
        )
        notification = alert.create_notification!
        ApiSchema.subscriptions.trigger("notificationCreated", {}, notification)
        PaceMailer.pace_exceeded(
          category: category,
          budget: budget,
          spent: spent,
          pace_rate: pace_rate
        ).deliver_later
      elsif last_alert&.recovered_at.nil? && last_alert.present?
        last_alert.update!(recovered_at: Time.current)
      end
    end
  end
end

class PaceAlertJob < ApplicationJob
  queue_as :default

  def perform
    today = Date.current

    PaceAlertSetting.active.each do |setting|
      next if setting.active_from_day > today.day

      category = setting.category
      result = BudgetPaceCalculator.new(category: category, date: today).call
      next unless result

      month = today.beginning_of_month
      last_alert = PaceAlert.where(category: category, month: month)
                            .order(triggered_at: :desc)
                            .first

      # pace_rate（小数）を整数%に換算してユーザー設定閾値と比較
      if result[:pace_rate] * 100 >= setting.threshold
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
          budget:   Budget.find_by(category: category, month: month),
          spent:    result[:spent],
          pace_rate: result[:pace_rate] * 100
        ).deliver_later
      elsif last_alert&.recovered_at.nil? && last_alert.present?
        last_alert.update!(recovered_at: Time.current)
      end
    end
  end
end

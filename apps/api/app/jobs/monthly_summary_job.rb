class MonthlySummaryJob < ApplicationJob
  queue_as :mailers

  def perform
    target_month = Date.current.beginning_of_month - 1.month
    SummaryMailer.monthly_summary(target_month: target_month).deliver_later
  end
end

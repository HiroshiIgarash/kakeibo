class UnclassifiedAlertJob < ApplicationJob
  queue_as :default

  def perform
    count = Transaction.where(category_id: nil).count

    if count == 0
      UnclassifiedAlert.first&.destroy
      return
    end

    alert = UnclassifiedAlert.first_or_initialize
    alert.count = count
    alert.save!

    alert.create_notification! unless alert.notification
    ApiSchema.subscriptions.trigger("notificationCreated", {}, alert.notification)
  end
end

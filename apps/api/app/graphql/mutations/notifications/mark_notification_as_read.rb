# frozen_string_literal: true

module Mutations
  module Notifications
    class MarkNotificationAsRead < Mutations::BaseMutation
      description "通知を既読にする"

      argument :id, ID, required: true

      field :notification, Types::NotificationType, null: true
      field :errors,       [ String ],              null: false

      def resolve(id:)
        notification = Notification.find_by(id: id)

        unless notification
          return { notification: nil, errors: [ "Notification not found" ] }
        end

        notification.update!(read_at: Time.current)
        { notification: notification, errors: [] }
      end
    end
  end
end

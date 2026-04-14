# frozen_string_literal: true

module Mutations
  module Notifications
    class MarkAllNotificationsAsRead < Mutations::BaseMutation
      description "全未読通知を既読にする"

      field :count,  Integer,  null: false
      field :errors, [ String ], null: false

      def resolve
        count = Notification.unread.update_all(read_at: Time.current)
        { count: count, errors: [] }
      end
    end
  end
end

# frozen_string_literal: true

module Subscriptions
  class NotificationCreated < GraphQL::Schema::Subscription
    payload_type Types::NotificationType

    def subscribe
      NO_UPDATE
    end

    def update
      object
    end
  end
end

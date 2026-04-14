# frozen_string_literal: true

module Types
  class SubscriptionType < GraphQL::Schema::Object
    field :notification_created,
          subscription: Subscriptions::NotificationCreated,
          description: "通知が作成されたときに発火する"
  end
end

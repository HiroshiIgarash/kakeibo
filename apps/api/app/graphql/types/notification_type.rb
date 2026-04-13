# frozen_string_literal: true

module Types
  class NotificationType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,         ID,                              null: false, description: "通知ID"
    field :notifiable, Types::NotifiableType,           null: false, description: "通知の対象（BudgetAlertまたはUnclassifiedAlert）"
    field :read_at,    GraphQL::Types::ISO8601DateTime,  null: true,  description: "既読日時"
  end
end

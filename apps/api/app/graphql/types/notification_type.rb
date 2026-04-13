# frozen_string_literal: true

module Types
  class NotificationType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,              ID,                             null: false, description: "通知ID"
    field :notifiable_type, String,                         null: false, description: "通知元の種別（BudgetAlert / UnclassifiedAlert）"
    field :notifiable_id,   ID,                             null: false, description: "通知元のID"
    field :read_at,         GraphQL::Types::ISO8601DateTime, null: true,  description: "既読日時"
  end
end

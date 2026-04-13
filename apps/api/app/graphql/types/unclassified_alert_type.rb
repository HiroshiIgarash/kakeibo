# frozen_string_literal: true

module Types
  class UnclassifiedAlertType < Types::BaseObject
    implements Types::Concerns::Timestampable

    field :id,    ID,      null: false, description: "未分類アラートID"
    field :count, Integer, null: false, description: "未分類取引件数"
  end
end

# frozen_string_literal: true

module Types
  module Concerns
    module Timestampable
      include Types::BaseInterface

      field :created_at, GraphQL::Types::ISO8601DateTime, null: false, description: "作成日時"
      field :updated_at, GraphQL::Types::ISO8601DateTime, null: false, description: "更新日時"
    end
  end
end

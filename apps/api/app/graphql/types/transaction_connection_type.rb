# frozen_string_literal: true

module Types
  class TransactionConnectionType < Types::BaseConnection
    edge_type(Types::TransactionType.edge_type)

    field :total_count, Integer, null: false, description: "総件数"

    def total_count
      object.items.size
    end
  end
end

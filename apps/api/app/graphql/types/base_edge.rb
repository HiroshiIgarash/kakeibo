# frozen_string_literal: true

module Types
  class BaseEdge < GraphQL::Types::Relay::BaseEdge
    include GraphQL::Types::Relay::EdgeBehaviors
  end
end

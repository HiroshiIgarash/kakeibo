# frozen_string_literal: true

module Types
  class BaseConnection < GraphQL::Types::Relay::BaseConnection
    include GraphQL::Types::Relay::ConnectionBehaviors
  end
end

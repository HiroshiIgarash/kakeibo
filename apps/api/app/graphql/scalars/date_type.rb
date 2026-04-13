# frozen_string_literal: true

module Scalars
  class DateType < Types::BaseScalar
    graphql_name "Date"
    description "ISO8601形式の日付(例: 2024-01-15)"

    def self.coerce_input(value, _context)
      Date.parse(value)
    rescue ArgumentError, TypeError
      raise GraphQL::CoercionError, "#{value.inspect}は有効な日付ではありません"
    end

    def self.coerce_result(value, _context)
      value.strftime("%Y-%m-%d")
    end
  end
end

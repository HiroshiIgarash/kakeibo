# frozen_string_literal: true

module Types
  class PaceStatusType < Types::BaseEnum
    graphql_name "PaceStatus"
    description "予算消化ペースの状態"

    value "GREEN",  description: "余裕あり"
    value "YELLOW", description: "要注意"
    value "RED",    description: "危険・超過"
  end
end

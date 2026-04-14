# frozen_string_literal: true

module Types
  class AlertSettingKindType < Types::BaseEnum
    graphql_name "AlertSettingKind"
    description "アラート設定の種別"

    value "BUDGET", description: "予算アラート設定"
    value "PACE",   description: "ペースアラート設定"
  end
end

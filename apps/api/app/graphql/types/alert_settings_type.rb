# frozen_string_literal: true

module Types
  class AlertSettingsType < Types::BaseObject
    description "全アラート設定"

    field :budget_alert_settings, [ Types::BudgetAlertSettingType ], null: false,
          description: "予算アラート設定一覧"
    field :pace_alert_settings, [ Types::PaceAlertSettingType ], null: false,
          description: "ペースアラート設定一覧"
  end
end

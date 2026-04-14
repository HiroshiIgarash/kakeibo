# frozen_string_literal: true

module Mutations
  module AlertSettings
    class UpsertAlertSetting < Mutations::BaseMutation
      description "アラート設定を作成または更新する（予算・ペース両対応）"

      argument :setting_type,    Types::AlertSettingKindType, required: true,  description: "設定種別（BUDGET / PACE）"
      argument :category_id,     ID,                          required: false, description: "カテゴリID（nilで全体）"
      argument :is_active,       Boolean,                     required: false, default_value: true, description: "有効フラグ"
      argument :threshold,       Integer,                     required: true,  description: "閾値（%）"
      argument :threshold_2,     Integer,                     required: false, description: "第2閾値（%）予算アラートのみ"
      argument :active_from_day, Integer,                     required: false, description: "送信開始日 ペースアラートのみ"

      field :budget_alert_setting, Types::BudgetAlertSettingType, null: true
      field :pace_alert_setting,   Types::PaceAlertSettingType,   null: true
      field :errors,               [ String ],                     null: false

      def resolve(setting_type:, category_id: nil, is_active: true, threshold:, threshold_2: nil, active_from_day: nil)
        case setting_type
        when "BUDGET"
          upsert_budget_alert_setting(category_id, threshold, threshold_2, is_active)
        when "PACE"
          upsert_pace_alert_setting(category_id, threshold, active_from_day, is_active)
        end
      end

      private

      def upsert_budget_alert_setting(category_id, threshold, threshold_2, is_active)
        setting = BudgetAlertSetting.find_or_initialize_by(category_id: category_id)
        setting.assign_attributes(threshold: threshold, threshold_2: threshold_2, is_active: is_active)

        if setting.save
          { budget_alert_setting: setting, pace_alert_setting: nil, errors: [] }
        else
          { budget_alert_setting: nil, pace_alert_setting: nil, errors: setting.errors.full_messages }
        end
      end

      def upsert_pace_alert_setting(category_id, threshold, active_from_day, is_active)
        setting = PaceAlertSetting.find_or_initialize_by(category_id: category_id)
        setting.assign_attributes(
          threshold: threshold,
          active_from_day: active_from_day || setting.active_from_day || 5,
          is_active: is_active
        )

        if setting.save
          { budget_alert_setting: nil, pace_alert_setting: setting, errors: [] }
        else
          { budget_alert_setting: nil, pace_alert_setting: nil, errors: setting.errors.full_messages }
        end
      end
    end
  end
end

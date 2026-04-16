# frozen_string_literal: true

module Types
  class DailyAllowanceType < Types::BaseObject
    description "日当たり許容額とペース状態"

    field :pace_status,      Types::PaceStatusType, null: false, description: "ペース状態（GREEN/YELLOW/RED）"
    field :spent,            Integer,               null: false, description: "当月使用額（円）"
    field :budget_amount,    Integer,               null: false, description: "月予算額（円）"
    field :remaining_amount, Integer,               null: false, description: "残額（円）"
    field :remaining_days,   Integer,               null: false, description: "残り日数"
    field :daily_amount,     Integer,               null: false, description: "今日からの日当たり許容額（円）"
    field :pace_rate,        Float,                 null: false, description: "ペース率（実績消費率 / 理想消費率）"
  end
end

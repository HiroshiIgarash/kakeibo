# frozen_string_literal: true

module Types
  module Inputs
    class BudgetInput < Types::BaseInputObject
      description "予算の作成・更新に使う入力値"

      argument :amount,      Integer,          required: true,  description: "予算額"
      argument :month,       Scalars::DateType, required: true,  description: "対象月（月初の日付）"
      argument :category_id, ID,               required: true,  description: "カテゴリID"
    end
  end
end

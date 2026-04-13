# frozen_string_literal: true

module Types
  class TransactionSourceType < Types::BaseEnum
    graphql_name "TransactionSource"
    description "取引の入力元"

    value "SHORTCUT", "iPhoneショートカット経由", value: "shortcut"
    value "MANUAL", "手動入力", value: "manual"
  end
end
